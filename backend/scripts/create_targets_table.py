"""One-off: create `Targets` table in Lark Base + seed current month rows.

Run: cd backend && python scripts/create_targets_table.py
Reads LARK_* env vars from backend/.env via python-dotenv.
"""
import os
import sys
from datetime import date, datetime
from pathlib import Path

import httpx
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

LARK_DOMAIN = "https://open.larksuite.com"
APP_ID = os.environ["LARK_APP_ID"]
APP_SECRET = os.environ["LARK_APP_SECRET"]
APP_TOKEN = os.environ["LARK_BASE_APP_TOKEN"]


def get_token() -> str:
    resp = httpx.post(
        f"{LARK_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal",
        json={"app_id": APP_ID, "app_secret": APP_SECRET},
        timeout=15,
    )
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"Auth fail: {data}")
    return data["tenant_access_token"]


def create_table(token: str) -> str:
    """Create table with 3 fields: Location (SingleSelect), Month (DateTime), Target_GMV_RMB (Number).

    Lark Base API only accepts text/number/checkbox in initial fields payload.
    Strategy: create table with Location as text + Month + Target. Convert
    Location field to Single Select after with `appTableField/update`.
    """
    url = f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables"
    body = {
        "table": {
            "name": "Targets",
            "default_view_name": "Grid",
            "fields": [
                {"field_name": "Location", "type": 1},
                {"field_name": "Month", "type": 5},
                {"field_name": "Target_GMV_RMB", "type": 2},
            ],
        }
    }
    resp = httpx.post(
        url,
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=20,
    )
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"Create table fail: {data}")
    table_id = data["data"]["table_id"]
    print(f"Created table_id={table_id}")
    return table_id


def seed_records(token: str, table_id: str):
    """Add 4 rows for current month: Stellar Garden, Imperia Garden, Offline, HCM."""
    today = date.today()
    month_start = today.replace(day=1)
    month_ts_ms = int(
        datetime(month_start.year, month_start.month, month_start.day).timestamp() * 1000
    )

    rows = [
        {"Location": "Stellar Garden", "Month": month_ts_ms, "Target_GMV_RMB": 2000000},
        {"Location": "Imperia Garden", "Month": month_ts_ms, "Target_GMV_RMB": 400000},
        {"Location": "Offline", "Month": month_ts_ms, "Target_GMV_RMB": 80000},
        {"Location": "HCM", "Month": month_ts_ms, "Target_GMV_RMB": 150000},
    ]

    url = (
        f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/"
        f"{table_id}/records/batch_create"
    )
    body = {"records": [{"fields": r} for r in rows]}
    resp = httpx.post(
        url,
        headers={"Authorization": f"Bearer {token}"},
        json=body,
        timeout=20,
    )
    data = resp.json()
    if data.get("code") != 0:
        raise RuntimeError(f"Seed fail: {data}")
    print(f"Seeded {len(rows)} target rows for {month_start.isoformat()}")


def main():
    token = get_token()
    table_id = create_table(token)
    seed_records(token, table_id)

    print()
    print("Next: add to backend/.env →")
    print(f"  LARK_TARGETS_TABLE_ID={table_id}")
    print("Then restart backend.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
