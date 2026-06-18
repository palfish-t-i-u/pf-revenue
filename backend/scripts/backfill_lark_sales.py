"""Backfill Lark Base Sales.Khối + Active from GMV nhan_su_sale.

Match by Họ tên (Lark) == crm_name (GMV).
Uses subprocess+curl to call Lark API (httpx blocked on this host).
"""
import json
import os
import subprocess
import time
from pathlib import Path

from dotenv import load_dotenv
from supabase import create_client

load_dotenv(Path(__file__).parent.parent / ".env")

LARK_DOMAIN = "https://open.larksuite.com"
APP_ID = os.environ["LARK_APP_ID"]
APP_SECRET = os.environ["LARK_APP_SECRET"]
APP_TOKEN = os.environ["LARK_BASE_APP_TOKEN"]
SALES_TABLE_ID = "tbl2umPupa2LUKws"

SUPA = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_ROLE_KEY"],
)


def curl_json(method: str, url: str, headers: list, body=None) -> dict:
    cmd = ["curl", "-s", "--max-time", "30", "-X", method, url]
    for h in headers:
        cmd.extend(["-H", h])
    if body is not None:
        cmd.extend(["-H", "Content-Type: application/json", "-d", json.dumps(body)])
    out = subprocess.check_output(cmd, timeout=35)
    return json.loads(out.decode("utf-8"))


def get_token() -> str:
    data = curl_json(
        "POST",
        f"{LARK_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal",
        [],
        {"app_id": APP_ID, "app_secret": APP_SECRET},
    )
    return data["tenant_access_token"]


def fetch_all_lark_sales(token: str) -> list:
    out = []
    page_token = ""
    while True:
        url = (
            f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/"
            f"{SALES_TABLE_ID}/records?page_size=500"
            + (f"&page_token={page_token}" if page_token else "")
        )
        data = curl_json("GET", url, [f"Authorization: Bearer {token}"])
        if data.get("code") != 0:
            raise RuntimeError(f"Fetch fail: {data}")
        items = data.get("data", {}).get("items", [])
        out.extend(items)
        if not data.get("data", {}).get("has_more"):
            break
        page_token = data["data"].get("page_token", "")
        time.sleep(0.5)
    return out


def fetch_gmv_map() -> dict:
    """Return {crm_name: {khoi, is_active}}."""
    res = SUPA.table("nhan_su_sale").select(
        "crm_name, depart6_name, is_active"
    ).not_.is_("crm_name", "null").execute()
    out = {}
    for r in res.data or []:
        name = (r.get("crm_name") or "").strip()
        if name:
            out[name] = {
                "khoi": r.get("depart6_name") or "",
                "is_active": bool(r.get("is_active")),
            }
    return out


def main():
    print("Fetching GMV nhan_su_sale...")
    gmv_map = fetch_gmv_map()
    print(f"  {len(gmv_map)} sales in GMV")

    print("Fetching Lark Sales records...")
    token = get_token()
    lark_records = fetch_all_lark_sales(token)
    print(f"  {len(lark_records)} records in Lark Base")

    # Build update batch
    updates = []
    skipped = 0
    for rec in lark_records:
        record_id = rec["record_id"]
        ho_ten_field = rec.get("fields", {}).get("Họ tên")
        # Text field may come back as list of cells or string
        if isinstance(ho_ten_field, list):
            ho_ten = "".join(c.get("text", "") for c in ho_ten_field).strip()
        else:
            ho_ten = (ho_ten_field or "").strip()

        if not ho_ten:
            skipped += 1
            continue

        gmv = gmv_map.get(ho_ten)
        if not gmv:
            skipped += 1
            continue

        updates.append({
            "record_id": record_id,
            "fields": {
                "Khối": gmv["khoi"],
                "Active": gmv["is_active"],
            },
        })

    print(f"  matched: {len(updates)}  skipped (no GMV match): {skipped}")

    if not updates:
        print("Nothing to update")
        return

    # Batch update — 500 max per call but throttle to 100/batch + sleep
    print("Batch updating Lark Sales...")
    batch_size = 100
    for i in range(0, len(updates), batch_size):
        chunk = updates[i:i + batch_size]
        url = (
            f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/"
            f"{SALES_TABLE_ID}/records/batch_update"
        )
        data = curl_json(
            "POST",
            url,
            [f"Authorization: Bearer {token}"],
            {"records": chunk},
        )
        if data.get("code") != 0:
            print(f"  Batch {i}: ERROR {data}")
        else:
            n = len(data.get("data", {}).get("records", []))
            print(f"  Batch {i}: updated {n}")
        time.sleep(2)

    print("Done")


if __name__ == "__main__":
    main()
