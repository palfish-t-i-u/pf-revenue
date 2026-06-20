"""Daily report endpoint for Lark Automation.

Aggregates Supabase payments + Lark Base targets into a structured JSON
matching the legacy Streamlit "Palfish Report Online" template, plus a
pre-rendered text message ready for `Send a Lark message` action.
"""

import json
import os
import subprocess
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query


def _curl_json(method: str, url: str, headers: list[str], body: Optional[dict] = None) -> dict:
    """Invoke system curl — Python's httpx/requests/urllib hang on this host
    when reaching open.larksuite.com (Windows networking quirk), but curl works.
    """
    cmd = ["curl", "-s", "--max-time", "30", "-X", method, url]
    for h in headers:
        cmd.extend(["-H", h])
    if body is not None:
        cmd.extend(["-H", "Content-Type: application/json", "-d", json.dumps(body)])
    try:
        out = subprocess.check_output(cmd, timeout=35)
        return json.loads(out.decode("utf-8"))
    except Exception:
        return {}

router = APIRouter(prefix="/api/v1/lark")


# ─── Team mapping (Supabase sales.team values) ───────────────────
TEAMS = {
    "stellar_garden": ["In-house"],
    "imperia_garden": ["In-house 2"],
    "hcm": ["HCM"],
    "offline": ["Linh Dam Store", "An Binh Store"],
}
ONLINE_TEAMS = TEAMS["stellar_garden"] + TEAMS["imperia_garden"] + TEAMS["hcm"]
OFFLINE_TEAMS = TEAMS["offline"]

# Channel groups for "Including" section (online team only)
# Mapping per Palfish Report Online doc (Type column → group)
CHANNEL_GROUPS = {
    "new_purchase": ["New Purchase"],
    "general_database": ["GD", "公海"],
    "referral": ["Refer", "转介绍"],
    "renew_package": ["Resell", "续费"],
    "lives": ["Lives", "Livestream"],
}

# Lark Open API config
LARK_DOMAIN = "https://open.larksuite.com"
LARK_APP_ID = os.getenv("LARK_APP_ID", "")
LARK_APP_SECRET = os.getenv("LARK_APP_SECRET", "")
LARK_BASE_APP_TOKEN = os.getenv("LARK_BASE_APP_TOKEN", "")
LARK_TARGETS_TABLE_ID = os.getenv("LARK_TARGETS_TABLE_ID", "")

MONTHS_EN = [
    "", "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def _get_lark_token() -> Optional[str]:
    if not (LARK_APP_ID and LARK_APP_SECRET):
        return None
    data = _curl_json(
        "POST",
        f"{LARK_DOMAIN}/open-apis/auth/v3/tenant_access_token/internal",
        headers=[],
        body={"app_id": LARK_APP_ID, "app_secret": LARK_APP_SECRET},
    )
    if data.get("code") == 0:
        return data.get("tenant_access_token")
    return None


def _fetch_targets(token: str, target_month: str) -> dict:
    """Return {location_name: target_gmv_rmb} for the given YYYY-MM month."""
    if not (token and LARK_BASE_APP_TOKEN and LARK_TARGETS_TABLE_ID):
        return {}
    url = (
        f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/"
        f"{LARK_BASE_APP_TOKEN}/tables/{LARK_TARGETS_TABLE_ID}/records?page_size=100"
    )
    data = _curl_json(
        "GET",
        url,
        headers=[f"Authorization: Bearer {token}"],
    )
    if data.get("code") != 0:
        return {}

    out = {}
    for rec in data.get("data", {}).get("items", []):
        f = rec.get("fields", {}) or {}
        loc = f.get("Location")
        month_raw = f.get("Month")
        target = f.get("Target_GMV_RMB", 0)

        # Lark stores Single Select as string OR {text, type}
        if isinstance(loc, dict):
            loc = loc.get("text") or loc.get("value")
        # Lark date as millisecond timestamp
        if isinstance(month_raw, (int, float)):
            month_str = datetime.utcfromtimestamp(month_raw / 1000).strftime("%Y-%m")
        else:
            month_str = str(month_raw or "")[:7]

        if loc and month_str == target_month:
            try:
                out[loc] = float(target or 0)
            except (TypeError, ValueError):
                continue
    return out


def _fmt_rmb(n) -> str:
    """Format RMB amount as integer with dot thousand separator."""
    try:
        return f"{int(round(float(n))):,}".replace(",", ".")
    except (TypeError, ValueError):
        return "0"


def _render_message(d: date, payload: dict) -> str:
    vn = payload["vn_team"]
    sg = payload["stellar_garden"]
    ig = payload["imperia_garden"]
    off = payload["offline"]
    hcm = payload["hcm"]

    date_str = f"{d.day} {MONTHS_EN[d.month]} {d.year}"
    ch = vn["channels"]

    parts = [
        date_str,
        "VN team",
        f"Today's GMV: {_fmt_rmb(vn['today_gmv'])} RMB",
        f"Monthly GMV: {_fmt_rmb(vn['monthly_gmv'])} RMB",
        f"Total: {vn['total_orders']} Order",
        "Including",
        f"New Purchase : {ch['new_purchase']}",
        f"General Database : {ch['general_database']}",
        f"Referral : {ch['referral']}",
        f"Renew Package : {ch['renew_package']}",
        f"Lives : {ch['lives']}",
        f"Offline Linh Đàm : {ch['offline_linh_dam']}",
        f"Offline An Bình : {ch['offline_an_binh']}",
        f"Other channel: {ch['other_channel']}",
        "",
        "Stellar Garden",
        f"Today GMV inhouse Stellar Garden: {_fmt_rmb(sg['today_gmv'])} RMB",
        f"Monthly GMV inhouse Stellar Garden : {_fmt_rmb(sg['monthly_gmv'])} RMB",
        f"Progress: {sg['progress_pct']}%",
        f"Today's Free Trial: {sg['today_free_trial']}",
        f"Monthly's Free Trial: {sg['monthly_free_trial']}",
        f"Referral Lead: {sg['today_referral_lead']}",
        f"Monthly Referral Lead: {sg['monthly_referral_lead']}",
        "",
        "Imperia Garden",
        f"Today GMV inhouse Imperia Garden: {_fmt_rmb(ig['today_gmv'])} RMB",
        f"Monthly GMV inhouse Imperia Garden : {_fmt_rmb(ig['monthly_gmv'])} RMB",
        f"Progress: {ig['progress_pct']}%",
        f"Today's Free Trial: {ig['today_free_trial']}",
        f"Monthly's Free Trial: {ig['monthly_free_trial']}",
        f"Referral Lead: {ig['today_referral_lead']}",
        f"Monthly Referral Lead: {ig['monthly_referral_lead']}",
        "",
        "Offline",
        f"Today's GMV Offline: {_fmt_rmb(off['today_gmv'])} RMB",
        f"Monthly GMV Offline : {_fmt_rmb(off['monthly_gmv'])} RMB",
        f"Progress: {off['progress_pct']}%",
        f"Today's Free Trial: {off['today_free_trial']}",
        f"Monthly's Free Trial: {off['monthly_free_trial']}",
        f"Referral Lead: {off['today_referral_lead']}",
        f"Monthly Referral Lead: {off['monthly_referral_lead']}",
        "",
        "HCM",
        f"Today's GMV HCM: {_fmt_rmb(hcm['today_gmv'])} RMB",
        f"Monthly GMV HCM : {_fmt_rmb(hcm['monthly_gmv'])} RMB",
        f"Progress: {hcm['progress_pct']}%",
        f"Today's Free Trial: {hcm['today_free_trial']}",
        f"Monthly's Free Trial: {hcm['monthly_free_trial']}",
        f"Referral Lead: {hcm['today_referral_lead']}",
        f"Monthly Referral Lead: {hcm['monthly_referral_lead']}",
    ]
    return "\n".join(parts)


def register_lark_report_routes(app, sb_getter):

    def _sb():
        sb = sb_getter()
        if not sb:
            raise HTTPException(503, "Supabase chưa được cấu hình")
        return sb

    @router.get("/daily-report")
    def daily_report(
        report_date: Optional[str] = Query(None, alias="date"),
    ):
        """Aggregate VN team + 4 location blocks. Returns JSON + pre-rendered text.

        - `vn_team.channels`: 5 channel groups (online only) + 2 offline rows + other.
        - Per-location: today/monthly GMV (RMB), progress %, plus Free Trial /
          Referral Lead placeholders (0 — not in pf-revenue schema yet).
        - `formatted_message`: full text matching Streamlit report template,
          ready for Lark `Send a Lark message` action.

        `date` accepts YYYY-MM-DD or empty string (Lark Automation sends
        `?date=` when the query param is unset). Empty / invalid → today.
        """
        sb = _sb()
        d: date
        if report_date and report_date.strip():
            try:
                d = date.fromisoformat(report_date.strip())
            except ValueError:
                d = date.today()
        else:
            d = date.today()
        month_start = d.replace(day=1)

        start_str = f"{month_start.isoformat()}T00:00:00"
        end_str = f"{d.isoformat()}T23:59:59"

        try:
            payments_res = (
                sb.table("payments")
                .select("pay_time, team, channel_id, gmv_final")
                .is_("deleted_at", "null")
                .eq("status", "active")
                .gte("pay_time", start_str)
                .lte("pay_time", end_str)
                .execute()
            )
            payments = payments_res.data or []
        except Exception as exc:
            raise HTTPException(500, f"Lỗi query payments: {exc}")

        try:
            channel_res = sb.table("channels").select("id, name").execute()
            channel_map = {
                c["id"]: (c.get("name") or "")
                for c in (channel_res.data or [])
            }
        except Exception:
            channel_map = {}

        today_str = d.isoformat()

        def is_today(p):
            return (p.get("pay_time") or "")[:10] == today_str

        def channel_of(p):
            return channel_map.get(p.get("channel_id"), "")

        def aggregate(team_list, today_only=False, channels=None):
            count = 0
            gmv = 0.0
            for p in payments:
                if p.get("team") not in team_list:
                    continue
                if today_only and not is_today(p):
                    continue
                if channels is not None and channel_of(p) not in channels:
                    continue
                count += 1
                gmv += float(p.get("gmv_final") or 0)
            return count, gmv

        # ── VN team totals ───────────────────────────────────────
        today_count_online, today_gmv_online = aggregate(ONLINE_TEAMS, today_only=True)
        today_count_offline, today_gmv_offline = aggregate(OFFLINE_TEAMS, today_only=True)
        _, monthly_gmv_online = aggregate(ONLINE_TEAMS, today_only=False)
        _, monthly_gmv_offline = aggregate(OFFLINE_TEAMS, today_only=False)

        today_total_count = today_count_online + today_count_offline
        today_gmv_total = today_gmv_online + today_gmv_offline
        monthly_gmv_total = monthly_gmv_online + monthly_gmv_offline

        # ── Channel breakdown (online only, today) ───────────────
        channel_counts = {}
        for grp_key, ch_list in CHANNEL_GROUPS.items():
            c, _ = aggregate(ONLINE_TEAMS, today_only=True, channels=ch_list)
            channel_counts[grp_key] = c
        sum_grouped = sum(channel_counts.values())
        channel_counts["other_channel"] = max(0, today_count_online - sum_grouped)

        ld_count, _ = aggregate(["Linh Dam Store"], today_only=True)
        ab_count, _ = aggregate(["An Binh Store"], today_only=True)
        channel_counts["offline_linh_dam"] = ld_count
        channel_counts["offline_an_binh"] = ab_count

        # ── Targets from Lark Base ───────────────────────────────
        token = _get_lark_token()
        targets = _fetch_targets(token, d.strftime("%Y-%m")) if token else {}

        def loc_block(team_list, target_key):
            _, today_gmv = aggregate(team_list, today_only=True)
            _, monthly_gmv = aggregate(team_list, today_only=False)
            target = float(targets.get(target_key, 0) or 0)
            progress = round(monthly_gmv / target * 100, 2) if target > 0 else 0
            return {
                "today_gmv": today_gmv,
                "monthly_gmv": monthly_gmv,
                "target": target,
                "progress_pct": progress,
                "today_free_trial": 0,
                "monthly_free_trial": 0,
                "today_referral_lead": 0,
                "monthly_referral_lead": 0,
            }

        payload = {
            "date": d.isoformat(),
            "vn_team": {
                "today_gmv": today_gmv_total,
                "monthly_gmv": monthly_gmv_total,
                "total_orders": today_total_count,
                "channels": channel_counts,
            },
            "stellar_garden": loc_block(TEAMS["stellar_garden"], "Stellar Garden"),
            "imperia_garden": loc_block(TEAMS["imperia_garden"], "Imperia Garden"),
            "offline": loc_block(TEAMS["offline"], "Offline"),
            "hcm": loc_block(TEAMS["hcm"], "HCM"),
            "targets_loaded": bool(targets),
        }
        payload["formatted_message"] = _render_message(d, payload)
        return payload

    @router.post("/sync-gmv-formula")
    def sync_gmv_formula():
        """Rebuild Payments.`GMV Final` formula from Lark Base `Exchange Rates`.

        Each row in Exchange Rates = (Month, Rate). Formula generated as
        nested IF: pre-first-month uses `GMV RMB`, then per-month brackets
        use `GMV VND / rate_of_that_month`. Manager triggers this after
        editing Exchange Rates table (via Dashboard button → HTTP request).
        """
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

        token = _get_lark_token()
        if not token:
            raise HTTPException(502, "Không lấy được Lark token")

        # Read rates
        rates_url = (
            f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{LARK_BASE_APP_TOKEN}/"
            f"tables/{EXCHANGE_RATES_TABLE_ID}/records?page_size=200"
        )
        data = _curl_json("GET", rates_url, [f"Authorization: Bearer {token}"])
        if data.get("code") != 0:
            raise HTTPException(502, f"Lỗi đọc Exchange Rates: {data.get('msg')}")

        rates = []
        for rec in data.get("data", {}).get("items", []):
            f = rec.get("fields", {}) or {}
            month_raw = f.get("Month")
            rate = f.get("Rate")
            if not (isinstance(month_raw, (int, float)) and rate):
                continue
            d_ = datetime.fromtimestamp(month_raw / 1000).date().replace(day=1)
            rates.append((d_, float(rate)))
        rates.sort(key=lambda x: x[0])

        # Build formula
        if not rates:
            expr = GMV_RMB
        else:
            parts = []
            first_m = rates[0][0]
            parts.append(
                f"IF({NGAY}<DATE({first_m.year},{first_m.month},{first_m.day}),"
                f"{GMV_RMB},"
            )
            for i in range(len(rates) - 1):
                _, rate_i = rates[i]
                next_m, _ = rates[i + 1]
                parts.append(
                    f"IF({NGAY}<DATE({next_m.year},{next_m.month},{next_m.day}),"
                    f"{GMV_VND}/{int(rate_i)},"
                )
            _, last_rate = rates[-1]
            parts.append(f"{GMV_VND}/{int(last_rate)}")
            parts.append(")" * len(rates))
            expr = "".join(parts)

        # PUT field
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
        upd_url = (
            f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/{LARK_BASE_APP_TOKEN}/"
            f"tables/{PAYMENTS_TABLE_ID}/fields/{GMV_FINAL_FIELD_ID}"
        )
        r = _curl_json("PUT", upd_url, [f"Authorization: Bearer {token}"], body)
        if r.get("code") != 0:
            raise HTTPException(502, f"Lỗi update formula: {r.get('msg')}")

        return {
            "status": "ok",
            "rates_count": len(rates),
            "rates": [
                {"month": d_.isoformat(), "rate": int(r_)} for d_, r_ in rates
            ],
            "formula_chars": len(expr),
            "message": (
                f"✅ GMV Final formula updated. {len(rates)} rate(s) loaded."
                if rates
                else "⚠️ Không có rate nào trong Exchange Rates. Formula fallback GMV RMB."
            ),
        }

    @router.post("/sync-payments")
    def sync_payments_endpoint(
        background_tasks: BackgroundTasks,
        from_date: Optional[str] = Query(None, alias="from"),
    ):
        """Incremental sync so_doanh_thu → Lark Base Payments.

        Sync takes 60-90s (fetch 10K Customers + 15K Payments). Lark
        Automation HTTP times out at 60s, so we return immediately and
        run the work in a background task. User refreshes Lark Base to
        verify; logs visible in Render dashboard.

        `from`: YYYY-MM-DD, exclusive lower bound for ngay_tien_ve.
        Default: 7 days ago. Empty string → use default.
        """
        from datetime import timedelta

        from lark_payment_sync import sync_payments as _sync

        sb = _sb()
        if from_date and from_date.strip():
            try:
                d = date.fromisoformat(from_date.strip())
            except ValueError:
                d = date.today() - timedelta(days=7)
        else:
            d = date.today() - timedelta(days=7)

        SYNC_LOGS_TABLE_ID = "tblfBBHRoTEPLey5"

        def _write_sync_log(token, fields):
            try:
                url = (
                    f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/"
                    f"{LARK_BASE_APP_TOKEN}/tables/{SYNC_LOGS_TABLE_ID}/records"
                )
                _curl_json("POST", url, [f"Authorization: Bearer {token}"], {"fields": fields})
            except Exception as exc:
                print(f"[sync-payments] log write fail: {exc}")

        def _run_sync_safe(supabase_client, from_str):
            from datetime import datetime as _dt

            try:
                result = _sync(supabase_client, from_str)
                print(f"[sync-payments] DONE from={from_str}: {result}")
                token = _get_lark_token()
                if not token:
                    return
                from_ts = int(_dt.fromisoformat(from_str).timestamp() * 1000)
                msg = (
                    f"✅ Sync xong: tạo mới {result.get('payments_created', 0)} đơn + "
                    f"{result.get('customers_created', 0)} khách hàng. "
                    f"Bỏ qua {result.get('valid', 0) - result.get('payments_created', 0)} dòng "
                    f"(đã có hoặc thiếu dữ liệu)."
                )
                _write_sync_log(token, {
                    "Status": "success",
                    "From Date": from_ts,
                    "Payments Created": result.get("payments_created", 0),
                    "Customers Created": result.get("customers_created", 0),
                    "Skip Stats": json.dumps(result.get("skip_stats", {}), ensure_ascii=False),
                    "Message": msg,
                })
            except Exception as exc:
                import traceback
                print(f"[sync-payments] FAILED from={from_str}: {exc}")
                traceback.print_exc()
                try:
                    token = _get_lark_token()
                    if token:
                        from_ts = int(_dt.fromisoformat(from_str).timestamp() * 1000)
                        _write_sync_log(token, {
                            "Status": "error",
                            "From Date": from_ts,
                            "Payments Created": 0,
                            "Customers Created": 0,
                            "Message": f"❌ Sync lỗi: {str(exc)[:200]}",
                        })
                except Exception:
                    pass

        background_tasks.add_task(_run_sync_safe, sb, d.isoformat())

        return {
            "status": "started",
            "from_date": d.isoformat(),
            "message": (
                "🔄 Đã bắt đầu sync data từ sheet All File Thu Hiền về "
                "Lark Base. Xin vui lòng chờ ~60-90s để dữ liệu cập nhật."
            ),
        }

    # ── Lark Sheet report refresh ──────────────────────────────
    REPORT_SHEET_TOKEN = os.getenv(
        "LARK_REPORT_SHEET_TOKEN", "LWqIs3Q8Ph49a7tEE6FjgdYipJg"
    )
    REPORT_BCTB_SHEET_ID = "f40d7f"
    REPORT_BC_CHAN_SHEET_ID = "SXJEk"
    PAYMENTS_TABLE_ID = "tbl4FJzV8YC21S9d"
    SALES_TABLE_ID = "tbl2umPupa2LUKws"
    CHANNELS_TABLE_ID = "tbl3aHNFWx08gPqm"
    CURRENT_MONTH_VIEW = "veweMuTm6b"

    def _extract_text(val):
        if isinstance(val, str):
            return val
        if isinstance(val, list):
            return "".join(
                v.get("text", "") if isinstance(v, dict) else str(v) for v in val
            )
        if isinstance(val, dict):
            return val.get("text", str(val))
        return str(val) if val else ""

    def _lark_search_records(token, table_id, body, page_size=500):
        """Paginated search across a Lark Base table."""
        all_items = []
        page_token = None
        while True:
            url = (
                f"{LARK_DOMAIN}/open-apis/bitable/v1/apps/"
                f"{LARK_BASE_APP_TOKEN}/tables/{table_id}/records/search"
                f"?page_size={page_size}"
            )
            if page_token:
                url += f"&page_token={page_token}"
            data = _curl_json(
                "POST", url, [f"Authorization: Bearer {token}"], body
            )
            items = data.get("data", {}).get("items", [])
            all_items.extend(items)
            if not data.get("data", {}).get("has_more", False):
                break
            page_token = data["data"].get("page_token")
        return all_items

    def _col_letter(n):
        result = ""
        while n >= 0:
            result = chr(65 + n % 26) + result
            n = n // 26 - 1
        return result

    def _refresh_sheets_work():
        from collections import defaultdict

        token = _get_lark_token()
        if not token:
            print("[refresh-sheets] ERROR: cannot get Lark token")
            return

        auth = f"Authorization: Bearer {token}"
        sheets_base = f"{LARK_DOMAIN}/open-apis/sheets/v2/spreadsheets/{REPORT_SHEET_TOKEN}"

        # ── Fetch current-month payments ────────────────────────
        records = _lark_search_records(
            token,
            PAYMENTS_TABLE_ID,
            {
                "view_id": CURRENT_MONTH_VIEW,
                "field_names": [
                    "Ngày thanh toán", "Sale", "Kênh", "GMV VND", "GMV RMB",
                ],
            },
        )
        print(f"[refresh-sheets] payments: {len(records)}")

        # ── Sales lookup ────────────────────────────────────────
        sale_items = _lark_search_records(
            token, SALES_TABLE_ID,
            {"field_names": ["Họ tên", "Team"]},
        )
        sale_map = {}
        for s in sale_items:
            f = s.get("fields", {})
            sale_map[s["record_id"]] = {
                "name": _extract_text(f.get("Họ tên", "")),
                "team": str(f.get("Team", "")),
            }

        # ── Channels lookup ─────────────────────────────────────
        chan_items = _lark_search_records(
            token, CHANNELS_TABLE_ID,
            {"field_names": ["Tên kênh", "Loại"]},
        )
        chan_map = {}
        for c in chan_items:
            f = c.get("fields", {})
            name = _extract_text(f.get("Tên kênh", "")) or _extract_text(
                f.get("Loại", "")
            )
            chan_map[c["record_id"]] = name

        # ── Aggregate ───────────────────────────────────────────
        sale_agg = defaultdict(lambda: defaultdict(lambda: {"gmv_vnd": 0, "gmv_rmb": 0, "count": 0}))
        chan_agg = defaultdict(lambda: defaultdict(lambda: {"count": 0, "gmv_rmb": 0, "don_dau": 0}))
        dates_set = set()

        for r in records:
            f = r.get("fields", {})
            ts = f.get("Ngày thanh toán")
            if not ts:
                continue
            d_str = datetime.fromtimestamp(ts / 1000).strftime("%m-%d")
            dates_set.add(d_str)

            gmv_vnd = f.get("GMV VND", 0) if isinstance(f.get("GMV VND"), (int, float)) else 0
            gmv_rmb = f.get("GMV RMB", 0) if isinstance(f.get("GMV RMB"), (int, float)) else 0

            sale_info = f.get("Sale", {})
            sale_ids = sale_info.get("link_record_ids", []) if isinstance(sale_info, dict) else []
            sale_name = sale_map.get(sale_ids[0], {}).get("name", "Unknown") if sale_ids else "Unknown"
            sale_agg[sale_name][d_str]["gmv_vnd"] += gmv_vnd
            sale_agg[sale_name][d_str]["gmv_rmb"] += gmv_rmb
            sale_agg[sale_name][d_str]["count"] += 1

            chan_info = f.get("Kênh", {})
            chan_ids = chan_info.get("link_record_ids", []) if isinstance(chan_info, dict) else []
            channel = chan_map.get(chan_ids[0], "Unknown") if chan_ids else "N/A"
            chan_agg[channel][d_str]["count"] += 1
            chan_agg[channel][d_str]["gmv_rmb"] += gmv_rmb
            chan_agg[channel][d_str]["don_dau"] += 1

        dates = sorted(dates_set)

        # Sale totals
        sale_totals = {}
        for sale in sale_agg:
            t = {"gmv_vnd": 0, "gmv_rmb": 0, "count": 0}
            for d in dates:
                day = sale_agg[sale].get(d, {"gmv_vnd": 0, "gmv_rmb": 0, "count": 0})
                for k in t:
                    t[k] += day[k]
            sale_totals[sale] = t
        sorted_sales = sorted(sale_totals, key=lambda s: sale_totals[s]["gmv_vnd"], reverse=True)

        # Channel totals
        chan_totals = {}
        for ch in chan_agg:
            t = {"count": 0, "gmv_rmb": 0, "don_dau": 0}
            for d in dates:
                day = chan_agg[ch].get(d, {"count": 0, "gmv_rmb": 0, "don_dau": 0})
                for k in t:
                    t[k] += day[k]
            chan_totals[ch] = t
        sorted_channels = sorted(
            [c for c in chan_totals if c not in ("Unknown", "N/A")],
            key=lambda c: chan_totals[c]["count"],
            reverse=True,
        )

        def fmt(n):
            if n is None or n == "" or n == 0:
                return ""
            if isinstance(n, float):
                n = round(n)
            return f"{int(n):,}".replace(",", ".")

        # ── Build BCTB grid ─────────────────────────────────────
        row1 = ["Sale", "Total", "", ""]
        row2 = ["", "GMV VND", "GMV RMB", "Order"]
        for d in dates:
            row1.extend([d, "", ""])
            row2.extend(["GMV VND", "GMV RMB", "Order"])

        grand = {"gmv_vnd": 0, "gmv_rmb": 0, "count": 0}
        for s in sorted_sales:
            for k in grand:
                grand[k] += sale_totals[s][k]

        row_total = ["Total", fmt(grand["gmv_vnd"]), fmt(round(grand["gmv_rmb"])), str(grand["count"])]
        for d in dates:
            dv = sum(sale_agg[s].get(d, {}).get("gmv_vnd", 0) for s in sorted_sales)
            dr = sum(sale_agg[s].get(d, {}).get("gmv_rmb", 0) for s in sorted_sales)
            dc = sum(sale_agg[s].get(d, {}).get("count", 0) for s in sorted_sales)
            row_total.extend([fmt(dv), fmt(round(dr)), str(dc) if dc else ""])

        bctb_data = [row1, row2, row_total]
        for s in sorted_sales:
            t = sale_totals[s]
            row = [s, fmt(t["gmv_vnd"]), fmt(round(t["gmv_rmb"])), str(t["count"])]
            for d in dates:
                day = sale_agg[s].get(d, {})
                v, r_, c = day.get("gmv_vnd", 0), day.get("gmv_rmb", 0), day.get("count", 0)
                row.extend([fmt(v), fmt(round(r_)) if r_ else "", str(c) if c else ""])
            bctb_data.append(row)

        bctb_end = _col_letter(len(row1) - 1)
        bctb_range = f"{REPORT_BCTB_SHEET_ID}!A1:{bctb_end}{len(bctb_data)}"

        # ── Build BC Team Kênh grid ─────────────────────────────
        row1b = ["Ngày", "Total", "", ""]
        row2b = ["", "Số đơn", "GMV RMB", "Đơn đầu"]
        for ch in sorted_channels:
            row1b.extend([ch, "", ""])
            row2b.extend(["Số đơn", "GMV RMB", "Đơn đầu"])

        gt = {"count": 0, "gmv_rmb": 0, "don_dau": 0}
        for ch in sorted_channels:
            for k in gt:
                gt[k] += chan_totals[ch][k]

        row_totalb = ["Total", str(gt["count"]), fmt(round(gt["gmv_rmb"])), str(gt["don_dau"])]
        for ch in sorted_channels:
            t = chan_totals[ch]
            row_totalb.extend([str(t["count"]), fmt(round(t["gmv_rmb"])), str(t["don_dau"])])

        bc_data = [row1b, row2b, row_totalb]
        for d in reversed(dates):
            row = [d]
            dc = sum(chan_agg[ch].get(d, {}).get("count", 0) for ch in sorted_channels)
            dr = sum(chan_agg[ch].get(d, {}).get("gmv_rmb", 0) for ch in sorted_channels)
            dd = sum(chan_agg[ch].get(d, {}).get("don_dau", 0) for ch in sorted_channels)
            row.extend([str(dc), fmt(round(dr)), str(dd)])
            for ch in sorted_channels:
                day = chan_agg[ch].get(d, {})
                row.extend([
                    str(day.get("count", "")) if day.get("count", 0) else "",
                    fmt(round(day.get("gmv_rmb", 0))) if day.get("gmv_rmb", 0) else "",
                    str(day.get("don_dau", "")) if day.get("don_dau", 0) else "",
                ])
            bc_data.append(row)

        bc_end = _col_letter(len(row1b) - 1)
        bc_range = f"{REPORT_BC_CHAN_SHEET_ID}!A1:{bc_end}{len(bc_data)}"

        # ── Apply text format first (prevents green tags) ──────
        bctb_full = f"{REPORT_BCTB_SHEET_ID}!A1:{bctb_end}{len(bctb_data)}"
        bc_full = f"{REPORT_BC_CHAN_SHEET_ID}!A1:{bc_end}{len(bc_data)}"
        for full_rng in [bctb_full, bc_full]:
            _curl_json(
                "PUT",
                f"{sheets_base}/style",
                [auth],
                {
                    "appendStyle": {
                        "range": full_rng,
                        "style": {"formatter": "@"},
                    }
                },
            )

        # ── Write both sheets ───────────────────────────────────
        for label, rng, vals in [("BCTB", bctb_range, bctb_data), ("BC", bc_range, bc_data)]:
            r = _curl_json(
                "PUT",
                f"{sheets_base}/values",
                [auth],
                {"valueRange": {"range": rng, "values": vals}},
            )
            print(f"[refresh-sheets] {label} write: code={r.get('code')}")

        print(
            f"[refresh-sheets] DONE — BCTB {len(bctb_data)} rows, "
            f"BC {len(bc_data)} rows, {len(dates)} dates"
        )

    @router.post("/refresh-report-sheets")
    def refresh_report_sheets(background_tasks: BackgroundTasks):
        """Refresh BCTB + BC Team Kênh Lark Sheets with latest Payments data.

        Runs in background (~30s). Triggered by Lark Automation or manual call.
        """
        background_tasks.add_task(_refresh_sheets_work)
        return {
            "status": "started",
            "sheet_url": f"https://ajpiov2uned8.jp.larksuite.com/sheets/{REPORT_SHEET_TOKEN}",
            "message": "Đang cập nhật báo cáo BCTB + BC Team Kênh...",
        }

    app.include_router(router)
