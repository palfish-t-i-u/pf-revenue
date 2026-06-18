"""Rebuild GMV Final formula from Lark Base Exchange Rates table.

Spec: each month has its own VND/RMB rate. GMV Final of a payment uses
the rate of the month the payment is in. Pre-first-rate-month payments
fall back to GMV RMB direct (historical migration).

Lark Base formula cannot do cross-table lookup without Link+Lookup,
which would require linking 15K Payments to Exchange Rates rows. So
instead we generate a nested IF formula listing each month inline and
re-deploy it via API whenever the rate table changes.

Behavior:
  Ngày < first_month_in_table        → GMV RMB
  month_i <= Ngày < month_{i+1}     → GMV VND / rate_i
  Ngày >= last_month                → GMV VND / last_rate

Run: python scripts/sync_gmv_formula.py
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

LARK_DOMAIN = "https://open.larksuite.com"
APP_ID = os.environ["LARK_APP_ID"]
APP_SECRET = os.environ["LARK_APP_SECRET"]
APP_TOKEN = os.environ["LARK_BASE_APP_TOKEN"]

EXCHANGE_RATES_TABLE_ID = "tblJpwVjAbGK5TeW"
PAYMENTS_TABLE_ID = "tbl4FJzV8YC21S9d"
GMV_FINAL_FIELD_ID = "fldhpys6ZS"

NGAY_FIELD_ID = "fld4N2ceVO"
GMV_VND_FIELD_ID = "fld6RdoQd6"
GMV_RMB_FIELD_ID = "fld28lShSb"

T = f"bitable::$table[{PAYMENTS_TABLE_ID}]"
NGAY = f"{T}.$field[{NGAY_FIELD_ID}]"
GMV_VND = f"{T}.$field[{GMV_VND_FIELD_ID}]"
GMV_RMB = f"{T}.$field[{GMV_RMB_FIELD_ID}]"


def curl_json(method, url, headers, body=None):
    cmd = ["curl", "-s", "--max-time", "30", "-X", method, url]
    for h in headers:
        cmd.extend(["-H", h])
    if body is not None:
        cmd.extend(["-H", "Content-Type: application/json", "-d", json.dumps(body)])
    return json.loads(subprocess.check_output(cmd, timeout=35))


def get_token():
    data = curl_json(
        "POST",
        f"{LARK_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal",
        [],
        {"app_id": APP_ID, "app_secret": APP_SECRET},
    )
    return data["tenant_access_token"]


def read_rates(token: str) -> list:
    """Return list[(date, rate)] sorted ASC by month."""
    url = (
        f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/"
        f"{EXCHANGE_RATES_TABLE_ID}/records?page_size=200"
    )
    data = curl_json("GET", url, [f"Authorization: Bearer {token}"])
    out = []
    for rec in data.get("data", {}).get("items", []):
        f = rec.get("fields", {}) or {}
        month_raw = f.get("Month")
        rate = f.get("Rate")
        if not (isinstance(month_raw, (int, float)) and rate):
            continue
        d = datetime.fromtimestamp(month_raw / 1000, tz=timezone.utc).date()
        # Snap to 1st of month for safety
        d = d.replace(day=1)
        out.append((d, float(rate)))
    out.sort(key=lambda x: x[0])
    return out


def build_formula(rates: list) -> str:
    """Generate nested IF formula.

    Sort rates ASC by month. Branches:
      Ngày < rates[0].month   → GMV RMB
      Ngày < rates[1].month   → GMV VND / rates[0].rate
      ...
      else                    → GMV VND / rates[-1].rate
    """
    if not rates:
        return GMV_RMB  # No rates → fallback historical

    parts = []
    # First branch: pre-history
    first_m = rates[0][0]
    parts.append(
        f"IF({NGAY}<DATE({first_m.year},{first_m.month},{first_m.day}),"
        f"{GMV_RMB},"
    )

    # Middle branches: month_i to month_{i+1}
    for i in range(len(rates) - 1):
        _, rate_i = rates[i]
        next_m, _ = rates[i + 1]
        parts.append(
            f"IF({NGAY}<DATE({next_m.year},{next_m.month},{next_m.day}),"
            f"{GMV_VND}/{int(rate_i)},"
        )

    # Final branch: latest rate
    _, last_rate = rates[-1]
    parts.append(f"{GMV_VND}/{int(last_rate)}")

    # Close all IFs
    parts.append(")" * len(rates))

    return "".join(parts)


def update_formula(token: str, expr: str):
    body = {
        "field_name": "GMV Final",
        "type": 20,
        "property": {
            "formatter": "¥0.00",
            "formula_expression": expr,
            "type": {
                "data_type": 2,
                "ui_property": {"currency_code": "CNY", "formatter": "0.00"},
                "ui_type": "Currency",
            },
        },
    }
    return curl_json(
        "PUT",
        f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/"
        f"{PAYMENTS_TABLE_ID}/fields/{GMV_FINAL_FIELD_ID}",
        [f"Authorization: Bearer {token}"],
        body,
    )


def main():
    token = get_token()
    rates = read_rates(token)
    if not rates:
        print("WARNING: no rates in Exchange Rates table", file=sys.stderr)
    else:
        print(f"Loaded {len(rates)} rate(s):")
        for d, r in rates:
            print(f"  {d.isoformat()}  →  {int(r)}")

    expr = build_formula(rates)
    print(f"\nFormula ({len(expr)} chars):\n  {expr}\n")

    r = update_formula(token, expr)
    if r.get("code") == 0:
        print("Updated GMV Final formula ✓")
    else:
        print(f"ERROR: {r}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
