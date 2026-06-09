"""Shared payment business rules (no FastAPI deps)."""

from __future__ import annotations

import os
from datetime import datetime, timezone
from decimal import Decimal, ROUND_HALF_UP

# ---------------------------------------------------------------------------
# Module-level cached values (loaded from DB on first call, refreshable)
# ---------------------------------------------------------------------------
_ENV_RATE = Decimal(os.getenv("GMV_EXCHANGE_RATE", "3700"))
_ENV_CUTOFF = datetime(2026, 6, 1, tzinfo=timezone.utc)

GMV_EXCHANGE_RATE: Decimal = _ENV_RATE
GMV_CUTOFF: datetime = _ENV_CUTOFF
_settings_loaded = False


def _load_settings_from_db(sb) -> None:  # noqa: ANN001
    """Read gmv_exchange_rate and gmv_cutoff_at from app_settings table.

    Falls back to env var / hardcoded defaults if table or keys are missing.
    """
    global GMV_EXCHANGE_RATE, GMV_CUTOFF, _settings_loaded
    if sb is None:
        return
    try:
        res = (
            sb.table("app_settings")
            .select("key, value")
            .in_("key", ["gmv_exchange_rate", "gmv_cutoff_at"])
            .execute()
        )
        for row in res.data or []:
            key = row["key"]
            val = row["value"]
            if key == "gmv_exchange_rate" and val is not None:
                GMV_EXCHANGE_RATE = Decimal(str(val))
            elif key == "gmv_cutoff_at" and val is not None:
                raw = str(val).strip('"')
                GMV_CUTOFF = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        _settings_loaded = True
    except Exception as exc:
        # Table might not exist yet — fall back silently
        print(f"[payment_logic] app_settings read failed (using defaults): {exc}")
        _settings_loaded = True  # don't retry every call


def ensure_settings_loaded(sb) -> None:  # noqa: ANN001
    """Ensure settings are loaded from DB at least once."""
    if not _settings_loaded:
        _load_settings_from_db(sb)


def refresh_settings(sb) -> None:  # noqa: ANN001
    """Force-reload settings from DB (called after PUT /settings/gmv)."""
    global _settings_loaded
    _settings_loaded = False
    _load_settings_from_db(sb)


def get_gmv_rule_meta() -> dict[str, float | str]:
    return {
        "exchange_rate": float(GMV_EXCHANGE_RATE),
        "cutoff_at": GMV_CUTOFF.isoformat(),
    }


def compute_gmv_final(
    pay_time: datetime,
    real_pay_vnd: Decimal,
    gmv_rmb: Decimal | None,
) -> Decimal:
    """Trước 01/06/2026 dùng gmv_rmb; từ 01/06 dùng VND/tỷ giá."""
    pt = pay_time
    if pt.tzinfo is None:
        pt = pt.replace(tzinfo=timezone.utc)
    if pt < GMV_CUTOFF:
        return (gmv_rmb or Decimal(0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if GMV_EXCHANGE_RATE == 0:
        return Decimal(0)
    return (real_pay_vnd / GMV_EXCHANGE_RATE).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
