"""Incremental sync so_doanh_thu (Supabase) → Lark Base Payments.

Shared module: used by `scripts/sync_lark_payments.py` (CLI for ops)
and `lark_report_routes.py` endpoint (button + schedule).
"""
import json
import os
import subprocess
import tempfile
import time
from collections import defaultdict
from datetime import date, datetime, timezone
from typing import Callable, Optional

LARK_DOMAIN = "https://open.larksuite.com"

# Lark Base table IDs
PAYMENTS_TABLE = "tbl4FJzV8YC21S9d"
CUSTOMERS_TABLE = "tbl2RlAIpK0nQMlE"

# so_doanh_thu.team → Lark Team SingleSelect option
TEAM_MAP = {
    "Inhouse 1": "In-house",
    "Inhouse 2": "In-house 2",
    "HCM (Online)": "HCM",
    "Linh Dam (Store)": "Linh Dam Store",
    "An Binh (Store)": "An Binh Store",
    "Aeon Mall (Booth)": "Aeon mall Booth",
    "Danang (Online)": "Danang",
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


def _fetch_all(token, app_token, table_id):
    out = []
    page_token = ""
    while True:
        params = "page_size=500"
        if page_token:
            params += f"&page_token={page_token}"
        url = (
            f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{app_token}/tables/"
            f"{table_id}/records?{params}"
        )
        data = _curl_json("GET", url, [f"Authorization: Bearer {token}"])
        if data.get("code") != 0:
            raise RuntimeError(f"fetch_all {table_id} fail: {data}")
        out.extend(data["data"].get("items", []))
        if not data["data"].get("has_more"):
            break
        page_token = data["data"].get("page_token", "")
        time.sleep(0.5)
    return out


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


def sync_payments(
    sb,
    from_date: str,
    log: Callable[[str], None] = print,
) -> dict:
    """Sync so_doanh_thu rows where ngay_tien_ve > from_date → Lark Payments.

    Args:
      sb: Supabase client
      from_date: YYYY-MM-DD string (exclusive lower bound)
      log: callable for progress logging

    Returns:
      dict with stats: rows_fetched, valid, skip_invalid, customers_created,
                       payments_created, skip_stats, errors
    """
    app_token = os.environ.get("LARK_BASE_APP_TOKEN", "")
    if not app_token:
        raise RuntimeError("LARK_BASE_APP_TOKEN missing")

    log(f"Sync from {from_date}")

    # ── 1. Read so_doanh_thu (paginated — Supabase default limit=1000) ─
    cols = (
        "id, pay_time, ngay_tien_ve, uid, ten_khach, sdt, "
        "sale_crm_name, team, loai, goi_hoc, so_tien_vnd, gmv_rmb, "
        "crm_order_id, note"
    )
    rows = []
    page_size = 1000
    offset = 0
    today_str = date.today().isoformat()
    while True:
        res = sb.table("so_doanh_thu").select(cols).gt(
            "ngay_tien_ve", from_date
        ).lte(
            "ngay_tien_ve", today_str
        ).range(offset, offset + page_size - 1).execute()
        batch = res.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    log(f"  {len(rows)} rows from so_doanh_thu")

    valid = [
        r for r in rows
        if r.get("uid") and r.get("ten_khach") and r.get("loai")
    ]
    skip_invalid = len(rows) - len(valid)
    log(f"  {len(valid)} valid, {skip_invalid} skipped (null required fields)")

    if not valid:
        return {
            "status": "noop",
            "rows_fetched": len(rows),
            "valid": 0,
            "skip_invalid": skip_invalid,
            "customers_created": 0,
            "payments_created": 0,
            "skip_stats": {},
            "errors": [],
        }

    # ── 2. Fetch Lark lookup tables ──────────────────────────────
    log("Fetching Lark lookups...")
    token = _get_token()

    cust_recs = _fetch_all(token, app_token, CUSTOMERS_TABLE)
    cust_map = {}
    for r in cust_recs:
        u = _text(r["fields"].get("UID"))
        if u:
            cust_map.setdefault(u, r["record_id"])

    pay_recs = _fetch_all(token, app_token, PAYMENTS_TABLE)
    existing_payment_ids = set()
    for r in pay_recs:
        pid = _text(r["fields"].get("Payment ID"))
        if pid:
            existing_payment_ids.add(pid)
    log(f"  lookups: {len(cust_map)} customers, "
        f"{len(existing_payment_ids)} existing payments")

    # ── 3. Auto-create missing Customers ─────────────────────────
    new_customers = []
    seen_uids = set()
    for r in valid:
        uid = r["uid"].strip()
        if uid in cust_map or uid in seen_uids:
            continue
        seen_uids.add(uid)
        first_seen = None
        if r.get("ngay_tien_ve"):
            first_seen = int(datetime.combine(
                datetime.fromisoformat(r["ngay_tien_ve"]).date(),
                datetime.min.time(),
                tzinfo=timezone.utc,
            ).timestamp() * 1000)
        new_customers.append({
            "UID": uid,
            "Khách hàng": r["ten_khach"].strip(),
            "SĐT": (r.get("sdt") or "").strip(),
            "First seen": first_seen,
        })

    customers_created = 0
    customer_errors = []
    if new_customers:
        log(f"Creating {len(new_customers)} new customers...")
        customers_created, customer_errors = _batch_create(
            token, app_token, CUSTOMERS_TABLE, new_customers
        )
        if customers_created:
            time.sleep(3)
            cust_recs2 = _fetch_all(token, app_token, CUSTOMERS_TABLE)
            cust_map = {}
            for r in cust_recs2:
                u = _text(r["fields"].get("UID"))
                if u:
                    cust_map.setdefault(u, r["record_id"])

    # ── 4. Build Payment records ─────────────────────────────────
    payments_to_create = []
    skip_stats = defaultdict(int)
    for r in valid:
        pid = str(r["id"])
        if pid in existing_payment_ids:
            skip_stats["already_exists"] += 1
            continue

        uid = r["uid"].strip()
        cust_id = cust_map.get(uid)
        if not cust_id:
            skip_stats["customer_missing"] += 1
            continue

        sale_name = (r.get("sale_crm_name") or "").strip()
        chan_name = (r.get("loai") or "").strip()
        pkg_name = (r.get("goi_hoc") or "").strip()
        team_raw = (r.get("team") or "").strip()
        team_lark = TEAM_MAP.get(team_raw, team_raw)

        fields = {
            "Payment ID": pid,
            "UID": uid,
            "Khách hàng": [cust_id],
            "GMV VND": int(r.get("so_tien_vnd") or 0),
            "GMV RMB": float(r.get("gmv_rmb") or 0),
        }
        if r.get("pay_time"):
            dt = datetime.fromisoformat(r["pay_time"].replace("Z", "+00:00"))
            fields["Ngày thanh toán"] = int(dt.timestamp() * 1000)
        if r.get("ngay_tien_ve"):
            fields["Ngày ngân hàng"] = r["ngay_tien_ve"]
        if sale_name:
            fields["Sale"] = sale_name
        if chan_name:
            fields["Kênh"] = chan_name
        if pkg_name:
            fields["Gói"] = pkg_name
        if team_lark:
            fields["Team"] = team_lark
        if r.get("crm_order_id"):
            fields["CRM Order ID"] = r["crm_order_id"]
        if r.get("note"):
            fields["Note"] = r["note"]
        if r.get("sdt"):
            fields["SĐT gốc"] = r["sdt"].strip()
        if r.get("ten_khach"):
            fields["Tên KH"] = r["ten_khach"].strip()

        payments_to_create.append(fields)

    log(f"  {len(payments_to_create)} payments to create, "
        f"skip: {dict(skip_stats)}")

    # ── 5. Batch create Payments ─────────────────────────────────
    payments_created, pay_errors = _batch_create(
        token, app_token, PAYMENTS_TABLE, payments_to_create
    )

    return {
        "status": "ok",
        "rows_fetched": len(rows),
        "valid": len(valid),
        "skip_invalid": skip_invalid,
        "customers_created": customers_created,
        "payments_created": payments_created,
        "skip_stats": dict(skip_stats),
        "errors": (customer_errors + pay_errors)[:10],
    }
