"""Incremental sync bank_transactions (Supabase) → Lark Base "GD SePay".

Pattern: clone của lark_payment_sync.py. Pull SePay transactions từ bảng
`bank_transactions` (app GMV ghi vào) → push lên bảng "GD SePay" trên Base
PalFish Revenue Manager.

Sliding window: caller gọi endpoint với `from_ts` = now() - vài phút để cover
case race condition giữa lúc INSERT bank_transactions và lúc poll.

Dedup: theo cột "Mã giao dịch SePay" (primary trên Lark, = sepay_id BIGINT).
"""

import json
import os
import subprocess
import tempfile
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Callable, Optional

LARK_DOMAIN = "https://open.larksuite.com"

# Lark Base table IDs
SEPAY_TABLE_ID = os.environ.get("LARK_TABLE_ID_SEPAY", "tbl6JRgNbsb9S4p7")

# match_status DB → Lark SingleSelect "Trạng thái đối soát"
STATUS_MAP = {
    "auto_matched": "Đã khớp",
    "needs_review": "Cần review",
    "pending": "Chờ xử lý",
    "ignored": "Bỏ qua",
}

# gateway DB → Lark SingleSelect "Nguồn dữ liệu"
SOURCE_MAP = {
    "sepay_webhook": "Webhook",
    "sepay_poll": "Poll",
}


def _curl_json(method, url, headers, body=None, timeout=30):
    cmd = ["curl", "-s", "--max-time", str(timeout), "-X", method, url]
    for h in headers:
        cmd.extend(["-H", h])
    tmp_path = None
    if body is not None:
        cmd.extend(["-H", "Content-Type: application/json"])
        body_json = json.dumps(body)
        if len(body_json) > 4000:  # Windows CLI 8KB limit
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


def _fetch_existing_sepay_ids(token, app_token, since_ts_ms):
    """Quét trang trên Lark "GD SePay" để build set sepay_id đã tồn tại.

    Để giảm cost, chỉ lấy bản ghi tạo trong N ngày gần đây (since_ts_ms).
    Worst case: nếu Lark trả nhiều page, dừng khi đạt ngưỡng 5000 records (an toàn
    cho 5000 GD/tháng).
    """
    existing = set()
    page_token = ""
    pages = 0
    MAX_PAGES = 25  # 25 * 500 = 12.5K records cap
    while pages < MAX_PAGES:
        params = "page_size=500"
        if page_token:
            params += f"&page_token={page_token}"
        url = (
            f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{app_token}/tables/"
            f"{SEPAY_TABLE_ID}/records?{params}"
        )
        data = _curl_json("GET", url, [f"Authorization: Bearer {token}"])
        if data.get("code") != 0:
            raise RuntimeError(f"fetch existing sepay_ids fail: {data}")
        for r in data["data"].get("items", []):
            f = r.get("fields", {}) or {}
            v = f.get("Mã giao dịch SePay")
            sid = _text(v)
            if sid:
                existing.add(sid)
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
    """Convert 1 dòng bank_transactions → fields cho Lark Bitable.

    Returns None nếu thiếu sepay_id (không insert được vì dedup theo field này).
    """
    sepay_id = row.get("sepay_id")
    if sepay_id is None:
        return None

    fields = {
        "Mã giao dịch SePay": str(sepay_id),
        "Số tiền (VND)": float(row.get("amount") or 0),
        "Nội dung CK": row.get("content") or row.get("transfer_content") or "",
        "Số tài khoản nhận": row.get("account_number") or "",
        "Tài khoản phụ (VA)": row.get("sub_account") or "",
        "Nguồn dữ liệu": SOURCE_MAP.get(row.get("gateway") or "", "Webhook"),
        "Trạng thái đối soát": STATUS_MAP.get(
            row.get("match_status") or "", "Chờ xử lý"
        ),
    }
    txn_date = row.get("transaction_date")
    if txn_date:
        try:
            dt = datetime.fromisoformat(str(txn_date).replace("Z", "+00:00"))
            fields["Thời gian giao dịch"] = int(dt.timestamp() * 1000)
        except Exception:
            pass
    return fields


def sync_bank_transactions(
    sb,
    from_iso: str,
    log: Callable[[str], None] = print,
) -> dict:
    """Sync bank_transactions có created_at > from_iso → Lark "GD SePay".

    Args:
      sb: Supabase client
      from_iso: ISO timestamp string (exclusive lower bound trên created_at)
      log: callable cho progress logging

    Returns:
      dict gồm rows_fetched, valid, created, skipped, skip_stats, errors
    """
    app_token = os.environ.get("LARK_BASE_APP_TOKEN", "")
    if not app_token:
        raise RuntimeError("LARK_BASE_APP_TOKEN missing")

    log(f"Sync bank_transactions created_at > {from_iso}")

    # ── 1. Read bank_transactions ────────────────────────────────
    res = (
        sb.table("bank_transactions")
        .select(
            "sepay_id, gateway, amount, content, transfer_content, "
            "account_number, sub_account, transaction_date, match_status, "
            "created_at"
        )
        .gt("created_at", from_iso)
        .order("created_at", desc=False)
        .limit(2000)
        .execute()
    )
    rows = res.data or []
    log(f"  {len(rows)} rows from bank_transactions")

    skip_stats = defaultdict(int)

    # Bỏ mPOS settlement — đã có cờ match_status='ignored' từ webhook
    valid_rows = []
    for r in rows:
        if (r.get("match_status") or "") == "ignored":
            skip_stats["mpos_settlement_ignored"] += 1
            continue
        if r.get("sepay_id") is None:
            skip_stats["missing_sepay_id"] += 1
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

    # ── 2. Fetch existing sepay_id từ Lark để dedup ──────────────
    log("Fetching existing sepay_ids on Lark...")
    token = _get_token()
    since_ms = 0  # full scan; nếu performance issue → giới hạn theo time field
    existing_ids = _fetch_existing_sepay_ids(token, app_token, since_ms)
    log(f"  {len(existing_ids)} existing on Lark")

    # ── 3. Build records to create ───────────────────────────────
    to_create = []
    for r in valid_rows:
        sid = str(r["sepay_id"])
        if sid in existing_ids:
            skip_stats["already_on_lark"] += 1
            continue
        fields = _map_row(r)
        if fields is None:
            skip_stats["map_failed"] += 1
            continue
        to_create.append(fields)

    log(f"  {len(to_create)} to create on Lark, skip: {dict(skip_stats)}")

    # ── 4. Batch create ──────────────────────────────────────────
    created, errors = _batch_create(token, app_token, SEPAY_TABLE_ID, to_create)
    log(f"  Created: {created}, errors: {len(errors)}")

    return {
        "status": "ok",
        "rows_fetched": len(rows),
        "valid": len(valid_rows),
        "created": created,
        "skip_stats": dict(skip_stats),
        "errors": errors[:10],
    }
