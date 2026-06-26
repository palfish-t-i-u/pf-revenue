"""Incremental sync gateway_transactions (Supabase) → Lark Base "GD mPOS/Payoo".

Pattern: clone của lark_bank_tx_sync.py. Pull mPOS / Payoo Online / Payoo
Installment transactions từ bảng `gateway_transactions` (app GMV ghi khi kế
toán upload file portal hoặc auto-import) → push lên bảng "GD mPOS/Payoo"
trên Base PalFish Revenue Manager.

Dedup: theo cột "Mã giao dịch" (primary trên Lark, = txn_code trên DB).
"""

import json
import os
import subprocess
import tempfile
import time
from collections import defaultdict
from datetime import datetime
from typing import Callable, Optional

LARK_DOMAIN = "https://open.larksuite.com"

GATEWAY_TABLE_ID = os.environ.get("LARK_TABLE_ID_GATEWAY", "tblBYhepvgo2KMRg")

# source DB → Lark SingleSelect "Cổng thanh toán"
SOURCE_MAP = {
    "mpos":              "mPOS",
    "payoo_online":      "Payoo",
    "payoo_installment": "Payoo",
}

# match_status DB → Lark SingleSelect "Trạng thái đối soát"
# Khác bảng SePay: option là "Cần kiểm tra" (không phải "Cần review")
STATUS_MAP = {
    "auto_matched": "Đã khớp",
    "needs_review": "Cần kiểm tra",
    "pending":      "Chờ xử lý",
    "ignored":      "Bỏ qua",
}


def _curl_json(method, url, headers, body=None, timeout=30):
    cmd = ["curl", "-s", "--max-time", str(timeout), "-X", method, url]
    for h in headers:
        cmd.extend(["-H", h])
    tmp_path = None
    if body is not None:
        cmd.extend(["-H", "Content-Type: application/json"])
        body_json = json.dumps(body)
        if len(body_json) > 4000:
            tf = tempfile.NamedTemporaryFile(
                mode="w", suffix=".json", delete=False, encoding="utf-8"
            )
            tf.write(body_json)
            tf.close()
            tmp_path = tf.name
            cmd.extend(["-d", f"@{tmp_path}"])
        else:
            cmd.extend(["-d", body_json])
    try:
        out = subprocess.check_output(cmd, timeout=timeout + 5)
        return json.loads(out.decode("utf-8"))
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def _text(field_val):
    if isinstance(field_val, list):
        return "".join(c.get("text", "") for c in field_val).strip()
    return (field_val or "").strip()


def _get_token():
    app_id = os.environ.get("LARK_APP_ID", "")
    app_secret = os.environ.get("LARK_APP_SECRET", "")
    if not (app_id and app_secret):
        raise RuntimeError("LARK_APP_ID/SECRET missing")
    data = _curl_json(
        "POST",
        f"{LARK_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal",
        [],
        {"app_id": app_id, "app_secret": app_secret},
    )
    if data.get("code") != 0:
        raise RuntimeError(f"Lark auth fail: {data}")
    return data["tenant_access_token"]


def _fetch_existing_txn_codes(token, app_token):
    """Build set txn_code đã có trên bảng Lark "GD mPOS/Payoo"."""
    existing = set()
    page_token = ""
    pages = 0
    MAX_PAGES = 25  # 25 * 500 = 12.5K cap
    while pages < MAX_PAGES:
        params = "page_size=500"
        if page_token:
            params += f"&page_token={page_token}"
        url = (
            f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{app_token}/tables/"
            f"{GATEWAY_TABLE_ID}/records?{params}"
        )
        data = _curl_json("GET", url, [f"Authorization: Bearer {token}"])
        if data.get("code") != 0:
            raise RuntimeError(f"fetch existing txn_codes fail: {data}")
        for r in data["data"].get("items", []):
            f = r.get("fields", {}) or {}
            v = _text(f.get("Mã giao dịch"))
            if v:
                existing.add(v)
        if not data["data"].get("has_more"):
            break
        page_token = data["data"].get("page_token", "")
        pages += 1
        time.sleep(0.3)
    return existing


def _batch_create(token, app_token, table_id, records, throttle=2.0):
    if not records:
        return 0, []
    created = 0
    errors = []
    url = (
        f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{app_token}/tables/"
        f"{table_id}/records/batch_create"
    )
    for i in range(0, len(records), 100):
        chunk = records[i:i + 100]
        body = {"records": [{"fields": r} for r in chunk]}
        try:
            data = _curl_json(
                "POST", url, [f"Authorization: Bearer {token}"], body, timeout=60
            )
        except Exception as exc:
            errors.append(f"batch {i}: {exc}")
            time.sleep(3)
            continue
        if data.get("code") == 0:
            created += len(data["data"].get("records", []))
        else:
            errors.append(f"batch {i}: code={data.get('code')} msg={data.get('msg')}")
        time.sleep(throttle)
    return created, errors


def _map_row(row: dict) -> Optional[dict]:
    """Convert 1 dòng gateway_transactions → fields cho Lark Bitable."""
    txn_code = (row.get("txn_code") or "").strip()
    if not txn_code:
        return None

    source = (row.get("source") or "").lower()
    fields = {
        "Mã giao dịch": txn_code,
        "Cổng thanh toán":           SOURCE_MAP.get(source, "mPOS"),
        "Loại giao dịch":            row.get("category") or "",
        "Mã đợt settlement":         row.get("settlement_code") or "",
        "Tên chủ thẻ":               row.get("cardholder_name") or "",
        "Số thẻ (che)":              row.get("card_masked") or "",
        "Loại thẻ":                  row.get("card_type") or "",
        "Số tiền khách trả (VND)":   float(row.get("amount") or 0),
        "Phí cổng (VND)":            float(row.get("fee") or 0),
        "Số tiền thực nhận (VND)":   float(row.get("net_amount") or 0),
        "Số kỳ trả góp":             int(row.get("installment_term") or 0),
        "Ngân hàng phát hành":       row.get("bank") or "",
        "Vùng thu":                  row.get("collector_region") or "",
        "Trạng thái đối soát":       STATUS_MAP.get(
            row.get("match_status") or "", "Chờ xử lý"
        ),
    }
    paid_at = row.get("paid_at")
    if paid_at:
        try:
            dt = datetime.fromisoformat(str(paid_at).replace("Z", "+00:00"))
            fields["Thời gian quẹt thẻ"] = int(dt.timestamp() * 1000)
        except Exception:
            pass
    return fields


def sync_gateway_transactions(
    sb,
    from_iso: str,
    log: Callable[[str], None] = print,
) -> dict:
    """Sync gateway_transactions có imported_at > from_iso → Lark "GD mPOS/Payoo".

    Args:
      sb: Supabase client
      from_iso: ISO timestamp (exclusive lower bound trên imported_at)
      log: callable cho progress logging

    Returns:
      dict gồm rows_fetched, valid, created, skipped, skip_stats, errors
    """
    app_token = os.environ.get("LARK_BASE_APP_TOKEN", "")
    if not app_token:
        raise RuntimeError("LARK_BASE_APP_TOKEN missing")

    log(f"Sync gateway_transactions imported_at > {from_iso}")

    res = (
        sb.table("gateway_transactions")
        .select(
            "txn_code, source, category, settlement_code, cardholder_name, "
            "card_masked, card_type, amount, fee, net_amount, installment_term, "
            "bank, collector_region, paid_at, match_status, imported_at"
        )
        .gt("imported_at", from_iso)
        .order("imported_at", desc=False)
        .limit(2000)
        .execute()
    )
    rows = res.data or []
    log(f"  {len(rows)} rows from gateway_transactions")

    skip_stats = defaultdict(int)
    valid_rows = []
    for r in rows:
        if not (r.get("txn_code") or "").strip():
            skip_stats["missing_txn_code"] += 1
            continue
        valid_rows.append(r)

    log(f"  {len(valid_rows)} valid (skip {sum(skip_stats.values())})")

    if not valid_rows:
        return {
            "status": "noop",
            "rows_fetched": len(rows),
            "valid": 0,
            "created": 0,
            "skip_stats": dict(skip_stats),
            "errors": [],
        }

    log("Fetching existing txn_codes on Lark...")
    token = _get_token()
    existing = _fetch_existing_txn_codes(token, app_token)
    log(f"  {len(existing)} existing on Lark")

    to_create = []
    for r in valid_rows:
        code = (r["txn_code"] or "").strip()
        if code in existing:
            skip_stats["already_on_lark"] += 1
            continue
        fields = _map_row(r)
        if fields is None:
            skip_stats["map_failed"] += 1
            continue
        to_create.append(fields)

    log(f"  {len(to_create)} to create on Lark, skip: {dict(skip_stats)}")

    created, errors = _batch_create(token, app_token, GATEWAY_TABLE_ID, to_create)
    log(f"  Created: {created}, errors: {len(errors)}")

    return {
        "status": "ok",
        "rows_fetched": len(rows),
        "valid": len(valid_rows),
        "created": created,
        "skip_stats": dict(skip_stats),
        "errors": errors[:10],
    }
