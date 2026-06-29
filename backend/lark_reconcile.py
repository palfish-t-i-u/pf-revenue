"""Auto-reconciliation: match GD SePay / GD mPOS records with Payments on Lark Base.

For each unmatched GD record, find a Payment with matching amount + date.
On match: set DuplexLink "Payment khớp", update status → "Đã khớp".

Matching rules:
  SePay:  "Số tiền (VND)" == Payment "GMV VND"  AND  date ±1 day
  mPOS:   "Số tiền khách trả (VND)" == Payment "GMV VND"  AND  date ±1 day

Tie-breakers when multiple candidates:
  1. Phone number extracted from SePay "Nội dung CK" vs Payment SĐT
  2. Closest date wins
  3. If still ambiguous, skip (manual review)
"""
import json
import os
import re
import subprocess
import time
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

LARK_DOMAIN = "https://open.larksuite.com"

PAYMENTS_TABLE = "tbl4FJzV8YC21S9d"
SEPAY_TABLE = os.environ.get("LARK_TABLE_ID_SEPAY", "tbl6JRgNbsb9S4p7")
GATEWAY_TABLE = os.environ.get("LARK_TABLE_ID_GATEWAY", "tblBYhepvgo2KMRg")

PHONE_RE = re.compile(r"(?:84|0)(\d{9})")
VN_TZ = timezone(timedelta(hours=7))


def _curl_json(method, url, headers, body=None, timeout=30):
    cmd = ["curl", "-s", "--max-time", str(timeout), "-X", method, url]
    for h in headers:
        cmd.extend(["-H", h])
    if body is not None:
        cmd.extend(["-H", "Content-Type: application/json", "-d", json.dumps(body)])
    try:
        out = subprocess.check_output(cmd, timeout=timeout + 5)
        return json.loads(out.decode("utf-8"))
    except Exception:
        return {}


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


def _text(field_val):
    if isinstance(field_val, list):
        return "".join(c.get("text", "") for c in field_val).strip()
    return str(field_val or "").strip()


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


def _batch_update(token, app_token, table_id, updates, throttle=1.0):
    if not updates:
        return 0
    url = (
        f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{app_token}/tables/"
        f"{table_id}/records/batch_update"
    )
    updated = 0
    for i in range(0, len(updates), 100):
        chunk = updates[i:i + 100]
        body = {"records": chunk}
        data = _curl_json("POST", url, [f"Authorization: Bearer {token}"], body, timeout=60)
        if data.get("code") == 0:
            updated += len(data["data"].get("records", []))
        else:
            print(f"[reconcile] batch_update {table_id} batch {i}: {data.get('msg')}")
        time.sleep(throttle)
    return updated


def _ts_to_date(ts):
    """Convert Lark timestamp (ms) or date string to Vietnam date."""
    if isinstance(ts, (int, float)) and ts > 1e9:
        return datetime.fromtimestamp(ts / 1000, tz=VN_TZ).date()
    if isinstance(ts, str):
        try:
            dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            return dt.astimezone(VN_TZ).date()
        except ValueError:
            pass
    return None


def _extract_phones(text):
    """Extract normalized 9-digit phone suffixes from transfer content."""
    return set(m.group(1) for m in PHONE_RE.finditer(text or ""))


def _normalize_phone(phone):
    """Normalize phone to 9-digit suffix."""
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if digits.startswith("84") and len(digits) >= 11:
        return digits[2:]
    if digits.startswith("0") and len(digits) >= 10:
        return digits[1:]
    if len(digits) == 9:
        return digits
    return None


def reconcile(
    log: Callable[[str], None] = print,
) -> dict:
    """Run auto-reconciliation across GD SePay + GD mPOS ↔ Payments.

    Returns dict with stats: sepay_matched, gateway_matched, skipped_ambiguous.
    """
    app_token = os.environ.get("LARK_BASE_APP_TOKEN", "")
    if not app_token:
        raise RuntimeError("LARK_BASE_APP_TOKEN missing")

    token = _get_token()
    log("[reconcile] Fetching Lark tables...")

    # ── 1. Fetch all three tables ────────────────────────────────
    payments_raw = _fetch_all(token, app_token, PAYMENTS_TABLE)
    sepay_raw = _fetch_all(token, app_token, SEPAY_TABLE)
    gateway_raw = _fetch_all(token, app_token, GATEWAY_TABLE)

    log(f"[reconcile] Loaded: {len(payments_raw)} payments, "
        f"{len(sepay_raw)} GD SePay, {len(gateway_raw)} GD mPOS/Payoo")

    # ── 2. Index Payments by amount → list of candidates ─────────
    # Only consider payments not yet matched (no linked GD record)
    payments_by_amount: dict[int, list] = {}
    matched_payment_ids = set()

    for rec in payments_raw:
        f = rec["fields"]
        rid = rec["record_id"]

        has_sepay_link = bool(f.get("GD SePay khớp"))
        has_gw_link = bool(f.get("GD mPOS/Payoo khớp"))
        if has_sepay_link or has_gw_link:
            matched_payment_ids.add(rid)
            continue

        amount = f.get("GMV VND")
        if not amount:
            continue
        amount_key = int(round(float(amount)))

        pay_date = _ts_to_date(f.get("Ngày thanh toán")) or _ts_to_date(f.get("Ngày ngân hàng"))
        bank_date = _ts_to_date(f.get("Ngày ngân hàng"))

        phone_raw = _text(f.get("SĐT gốc"))
        phone_norm = _normalize_phone(phone_raw)

        payments_by_amount.setdefault(amount_key, []).append({
            "record_id": rid,
            "pay_date": pay_date,
            "bank_date": bank_date,
            "phone": phone_norm,
            "uid": _text(f.get("UID")),
        })

    log(f"[reconcile] {len(matched_payment_ids)} payments already matched, "
        f"{sum(len(v) for v in payments_by_amount.values())} unmatched candidates")

    # ── Debug: sample data from each table ───────────────────────
    if payments_by_amount:
        sample_amounts = list(payments_by_amount.keys())[:5]
        log(f"[reconcile] DEBUG payment amount samples: {sample_amounts}")
        for amt in sample_amounts[:2]:
            for p in payments_by_amount[amt][:1]:
                log(f"[reconcile] DEBUG payment: amount={amt} pay_date={p['pay_date']} "
                    f"bank_date={p['bank_date']} phone={p['phone']} uid={p['uid']}")

    sepay_skip_reasons = {"already_matched": 0, "already_linked": 0,
                          "no_amount": 0, "no_candidates": 0, "no_date_match": 0}
    for rec in sepay_raw[:3]:
        f = rec["fields"]
        log(f"[reconcile] DEBUG sepay sample: "
            f"amount={f.get('Số tiền (VND)')} "
            f"date={f.get('Thời gian giao dịch')} "
            f"status={_text(f.get('Trạng thái đối soát'))} "
            f"linked={bool(f.get('Payment khớp'))} "
            f"content={_text(f.get('Nội dung CK'))[:50]}")

    for rec in gateway_raw[:3]:
        f = rec["fields"]
        log(f"[reconcile] DEBUG gateway sample: "
            f"amount={f.get('Số tiền khách trả (VND)')} "
            f"date={f.get('Thời gian quẹt thẻ')} "
            f"status={_text(f.get('Trạng thái đối soát'))} "
            f"linked={bool(f.get('Payment khớp'))}")

    # ── 3. Match SePay ───────────────────────────────────────────
    sepay_updates = []
    newly_matched = set()
    skipped_ambiguous = 0

    for rec in sepay_raw:
        f = rec["fields"]
        status = _text(f.get("Trạng thái đối soát"))
        if status == "Đã khớp" or status == "Bỏ qua":
            sepay_skip_reasons["already_matched"] += 1
            continue
        if f.get("Payment khớp"):
            sepay_skip_reasons["already_linked"] += 1
            continue

        amount = f.get("Số tiền (VND)")
        if not amount:
            sepay_skip_reasons["no_amount"] += 1
            continue
        amount_key = int(round(float(amount)))
        txn_date = _ts_to_date(f.get("Thời gian giao dịch"))

        candidates = payments_by_amount.get(amount_key, [])
        candidates = [c for c in candidates if c["record_id"] not in newly_matched]
        if not candidates:
            sepay_skip_reasons["no_candidates"] += 1
            log(f"[reconcile] DEBUG sepay no candidate: amount_key={amount_key} txn_date={txn_date}")
            continue

        if txn_date:
            pre_filter = len(candidates)
            candidates = [
                c for c in candidates
                if (c["bank_date"] and abs((c["bank_date"] - txn_date).days) <= 1)
                or (c["pay_date"] and abs((c["pay_date"] - txn_date).days) <= 1)
            ]
            if not candidates:
                sepay_skip_reasons["no_date_match"] += 1
                log(f"[reconcile] DEBUG sepay date mismatch: amount_key={amount_key} "
                    f"txn_date={txn_date} had {pre_filter} amount candidates")
        if not candidates:
            continue

        if len(candidates) == 1:
            match = candidates[0]
        else:
            content = _text(f.get("Nội dung CK"))
            content_phones = _extract_phones(content)
            phone_matches = [
                c for c in candidates
                if c["phone"] and c["phone"] in content_phones
            ]
            if len(phone_matches) == 1:
                match = phone_matches[0]
            elif txn_date:
                def date_dist(c):
                    d = c["bank_date"] or c["pay_date"]
                    return abs((d - txn_date).days) if d else 999
                candidates.sort(key=date_dist)
                if len(candidates) >= 2 and date_dist(candidates[0]) < date_dist(candidates[1]):
                    match = candidates[0]
                else:
                    skipped_ambiguous += 1
                    continue
            else:
                skipped_ambiguous += 1
                continue

        newly_matched.add(match["record_id"])
        sepay_updates.append({
            "record_id": rec["record_id"],
            "fields": {
                "Payment khớp": [match["record_id"]],
                "Trạng thái đối soát": "Đã khớp",
            },
        })

    log(f"[reconcile] SePay: {len(sepay_updates)} matches found, "
        f"skip reasons: {sepay_skip_reasons}")

    # ── 4. Match mPOS/Payoo ──────────────────────────────────────
    gateway_updates = []

    for rec in gateway_raw:
        f = rec["fields"]
        status = _text(f.get("Trạng thái đối soát"))
        if status == "Đã khớp" or status == "Bỏ qua":
            continue
        if f.get("Payment khớp"):
            continue

        amount = f.get("Số tiền khách trả (VND)")
        if not amount:
            continue
        amount_key = int(round(float(amount)))
        txn_date = _ts_to_date(f.get("Thời gian quẹt thẻ"))

        candidates = payments_by_amount.get(amount_key, [])
        candidates = [c for c in candidates if c["record_id"] not in newly_matched]
        if not candidates:
            continue

        if txn_date:
            candidates = [
                c for c in candidates
                if (c["pay_date"] and abs((c["pay_date"] - txn_date).days) <= 1)
                or (c["bank_date"] and abs((c["bank_date"] - txn_date).days) <= 2)
            ]
        if not candidates:
            continue

        if len(candidates) == 1:
            match = candidates[0]
        elif txn_date:
            def date_dist(c):
                d = c["pay_date"] or c["bank_date"]
                return abs((d - txn_date).days) if d else 999
            candidates.sort(key=date_dist)
            if len(candidates) >= 2 and date_dist(candidates[0]) < date_dist(candidates[1]):
                match = candidates[0]
            else:
                skipped_ambiguous += 1
                continue
        else:
            skipped_ambiguous += 1
            continue

        newly_matched.add(match["record_id"])
        gateway_updates.append({
            "record_id": rec["record_id"],
            "fields": {
                "Payment khớp": [match["record_id"]],
                "Trạng thái đối soát": "Đã khớp",
            },
        })

    log(f"[reconcile] mPOS/Payoo: {len(gateway_updates)} matches found")

    # ── 5. Write updates ─────────────────────────────────────────
    sepay_updated = 0
    gw_updated = 0

    if sepay_updates:
        log(f"[reconcile] Updating {len(sepay_updates)} GD SePay records...")
        sepay_updated = _batch_update(token, app_token, SEPAY_TABLE, sepay_updates)

    if gateway_updates:
        log(f"[reconcile] Updating {len(gateway_updates)} GD mPOS/Payoo records...")
        gw_updated = _batch_update(token, app_token, GATEWAY_TABLE, gateway_updates)

    log(f"[reconcile] Done: SePay={sepay_updated}, mPOS={gw_updated}, "
        f"ambiguous={skipped_ambiguous}")

    return {
        "sepay_matched": sepay_updated,
        "gateway_matched": gw_updated,
        "skipped_ambiguous": skipped_ambiguous,
        "total_matched": sepay_updated + gw_updated,
    }
