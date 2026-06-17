"""Seed 20 Lead Channel rows from GMV leadSource.ts."""
import json
import os
import subprocess
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

LARK_DOMAIN = "https://open.larksuite.com"
APP_ID = os.environ["LARK_APP_ID"]
APP_SECRET = os.environ["LARK_APP_SECRET"]
APP_TOKEN = os.environ["LARK_BASE_APP_TOKEN"]
LEAD_CHANNELS_TABLE_ID = "tblZT5x71YDggE67"

SOURCES = [
    ("Quảng cáo", [
        ("300265", "FB - VN"),
        ("300281", "FB H5 OV"),
        ("300431", "FB - Livestream"),
        ("300561", "FB-Instant Form-VN"),
        ("300571", "FB-Instant Form-OV"),
        ("300581", "FB-Landing Page-VN"),
        ("300531", "FB - Paid Partnership"),
        ("300301", "Tiktok ads"),
        ("300551", "Tiktokshop"),
        ("300291", "VN google"),
        ("300361", "Gọi hotline & nhắn tin FE"),
    ]),
    ("Giới thiệu", [("832", "Kênh giới thiệu")]),
    ("Offline", [
        ("300461", "HCM Offline booth"),
        ("300441", "VN Offline booth"),
        ("932", "Offline events"),
    ]),
    ("KOC", [("300391", "VN KOC")]),
    ("Khác", [
        ("300444", "Tài App - Palfish Class"),
        ("300445", "Tài App - Palfish English"),
        ("300311", "Sales tự tìm kiếm"),
        ("300471", "Sales tự tìm kiếm (HCM)"),
    ]),
]


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


def main():
    token = get_token()
    url_single = (
        f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/"
        f"{LEAD_CHANNELS_TABLE_ID}/records"
    )

    n = 0
    for source, items in SOURCES:
        for code, label in items:
            r = curl_json(
                "POST",
                url_single,
                [f"Authorization: Bearer {token}"],
                {"fields": {
                    "Code": code,
                    "Label": label,
                    "Source": source,
                    "Active": True,
                }},
            )
            if r.get("code") == 0:
                n += 1
                print(f"  ok  {code:<8}  {label}")
            else:
                print(f"  ERR {code}: {r}")
            time.sleep(1.5)
    print(f"Seeded {n} rows")


if __name__ == "__main__":
    main()
