"""CLI wrapper for backend.lark_payment_sync.sync_payments.

Used for ad-hoc backfill / initial sync. Production daily sync runs via
endpoint POST /api/v1/lark/sync-payments triggered by Lark Automation
schedule and Dashboard button.

Run: python scripts/sync_lark_payments.py --from 2026-06-07
"""
import argparse
import os
import sys
from pathlib import Path

# Add backend/ to path so we can import lark_payment_sync
BACKEND_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv

load_dotenv(BACKEND_DIR / ".env")

from supabase import create_client

from lark_payment_sync import sync_payments


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="from_date", required=True,
                    help="ngay_tien_ve > this date (YYYY-MM-DD)")
    args = ap.parse_args()

    sb = create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )
    result = sync_payments(sb, args.from_date)
    print()
    print("=== Result ===")
    for k, v in result.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
