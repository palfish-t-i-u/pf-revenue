"""Update Cảnh báo formula in Payments table — spec-compliant version.

Drops Khớp NH + Kích hoạt CRM checks (those are status flags, not warnings).
Expands MISSING_DATA to UID/Sale/Khách/Kênh/Gói/(GMV VND+RMB both 0).
RATE_DEVIATION uses percent threshold (20%) instead of hardcode 500.
"""
import json
import os
import subprocess
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

LARK_DOMAIN = "https://open.larksuite.com"
APP_ID = os.environ["LARK_APP_ID"]
APP_SECRET = os.environ["LARK_APP_SECRET"]
APP_TOKEN = os.environ["LARK_BASE_APP_TOKEN"]
PAYMENTS_TABLE_ID = "tbl4FJzV8YC21S9d"
CANH_BAO_FIELD_ID = "fldAu0XbDa"

T = f"bitable::$table[{PAYMENTS_TABLE_ID}]"

# Field IDs
UID = "fld3W70Ld2"
SALE = "fld1a4jNer"
KHACH = "fld1uB5n8u"
KENH = "fld5plosJL"
GOI = "fld4gPfeXR"
GMV_VND = "fld6RdoQd6"
GMV_RMB = "fld28lShSb"

NEW_FORMULA = (
    "CONCATENATE("
    "IF(OR("
    f'{T}.$field[{UID}]="",'
    f'{T}.$field[{SALE}]="",'
    f'{T}.$field[{KHACH}]="",'
    f'{T}.$field[{KENH}]="",'
    f'{T}.$field[{GOI}]="",'
    f"AND({T}.$field[{GMV_VND}]=0,{T}.$field[{GMV_RMB}]=0)"
    f'),"⚠️ Thiếu data; ",""),'
    "IF(AND("
    f"{T}.$field[{GMV_RMB}]>0,"
    f"{T}.$field[{GMV_VND}]>0,"
    f"ABS({T}.$field[{GMV_VND}]/{T}.$field[{GMV_RMB}]-3700)/3700>0.2"
    f'),"⚠️ Tỷ giá lệch; ","")'
    ")"
)


def curl_json(method, url, headers, body=None):
    cmd = ["curl", "-s", "--max-time", "30", "-X", method, url]
    for h in headers:
        cmd.extend(["-H", h])
    if body is not None:
        cmd.extend(["-H", "Content-Type: application/json", "-d", json.dumps(body)])
    return json.loads(subprocess.check_output(cmd, timeout=35))


def main():
    data = curl_json(
        "POST",
        f"{LARK_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal",
        [],
        {"app_id": APP_ID, "app_secret": APP_SECRET},
    )
    token = data["tenant_access_token"]

    body = {
        "field_name": "Cảnh báo",
        "type": 20,
        "property": {"formula_expression": NEW_FORMULA},
    }
    r = curl_json(
        "PUT",
        f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/"
        f"{PAYMENTS_TABLE_ID}/fields/{CANH_BAO_FIELD_ID}",
        [f"Authorization: Bearer {token}"],
        body,
    )
    print(json.dumps(r, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
