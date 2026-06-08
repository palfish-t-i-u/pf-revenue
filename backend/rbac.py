"""Role-based access helpers for PalFish Payments App.

Cloned from backend/rbac.py (GMV module) with adjustments:
  - _lookup_staff()     → queries `sales` table instead of `nhan_su_sale`
  - staff_to_profile()  → column mapping aligned to `sales` schema
  - Removed visible_creator_emails(), scope_sale_names() (GMV-only)
  - Removed vn_staff import (GMV-only)
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException

ROLE_RANK = {"sale": 1, "leader": 2, "manager": 3, "system": 4}
OPS_ROLES = {"ops", "system"}


@dataclass
class Actor:
    email: str
    user_id: str | None
    role: str
    staff: dict[str, Any] | None
    department: str | None = None
    is_activated: bool = False


def _normalize_role(raw: str | None) -> str:
    r = (raw or "sale").lower().strip()
    if r in ("ops", "admin"):
        return "system"
    if r not in ROLE_RANK:
        return "sale"
    return r


def _rank(role: str) -> int:
    return ROLE_RANK.get(_normalize_role(role), 1)


def _is_truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "y", "on"}
    return bool(value)


def require_min_role(actor: Actor, minimum: str) -> None:
    if _rank(actor.role) < _rank(minimum):
        raise HTTPException(403, f"Cần quyền {minimum} trở lên")


def can_confirm_payment(actor: Actor) -> bool:
    if _normalize_role(actor.role) in OPS_ROLES:
        return True
    ops_raw = os.getenv("OPS_EMAILS", "") or os.getenv("VITE_OPS_EMAILS", "")
    ops = {e.strip().lower() for e in ops_raw.split(",") if e.strip()}
    return actor.email.lower() in ops


def _extract_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def _auth_user_from_jwt(token: str) -> dict[str, Any] | None:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not url or not key:
        return None
    try:
        with httpx.Client(timeout=15) as client:
            res = client.get(
                f"{url}/auth/v1/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": key,
                },
            )
            if res.status_code != 200:
                return None
            return res.json()
    except Exception as exc:
        print(f"JWT user lookup failed: {exc}")
        return None


# ---------------------------------------------------------------------------
# Staff lookup — uses `sales` table (app mới) thay vì `nhan_su_sale` (GMV)
# ---------------------------------------------------------------------------
def _lookup_staff(sb, email: str) -> dict[str, Any] | None:
    try:
        res = (
            sb.table("sales")
            .select("*")
            .eq("email", email)
            .limit(1)
            .execute()
        )
        if res.data:
            return res.data[0]
        return None
    except Exception as exc:
        print(f"staff lookup: {exc}")
        return None


def resolve_actor(sb, authorization: str | None, *, allow_unactivated: bool = False) -> Actor:
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(401, "Thiếu token đăng nhập")

    user = _auth_user_from_jwt(token)
    if not user:
        raise HTTPException(401, "Token không hợp lệ")

    email = (user.get("email") or "").strip()
    if not email:
        raise HTTPException(401, "Email không có trong token")

    admin_emails = {
        e.strip().lower()
        for e in (os.getenv("SYSTEM_ADMIN_EMAILS") or "").split(",")
        if e.strip()
    }
    is_system_admin_email = email.lower() in admin_emails

    meta = user.get("user_metadata") or {}
    role = _normalize_role(meta.get("role"))
    staff = _lookup_staff(sb, email) if sb else None
    is_activated = _is_truthy(meta.get("is_activated", False))

    if staff:
        role = _normalize_role(staff.get("role") or role)
    elif is_system_admin_email:
        role = "system"
    elif meta.get("role"):
        role = _normalize_role(meta.get("role"))

    if (
        not allow_unactivated
        and not is_activated
        and not is_system_admin_email
        and role != "system"
    ):
        raise HTTPException(
            403,
            "Tài khoản chưa được kích hoạt. Vui lòng liên hệ admin.",
        )

    return Actor(
        email=email,
        user_id=user.get("id"),
        role=role,
        staff=staff,
        department=meta.get("department"),
        is_activated=is_activated,
    )


# ---------------------------------------------------------------------------
# Profile — column mapping aligned to `sales` table schema
# ---------------------------------------------------------------------------
def staff_to_profile(actor: Actor) -> dict[str, Any]:
    s = actor.staff or {}
    return {
        "email": actor.email,
        "userId": actor.user_id,
        "role": actor.role,
        "displayName": s.get("full_name"),
        "team": s.get("team"),
        "subTeam": s.get("khoi"),
        "isActive": s.get("active", True),
        "linked": bool(s.get("full_name")),
        "canConfirmPayment": can_confirm_payment(actor),
        "canAccessAdmin": _rank(actor.role) >= _rank("manager"),
        "canManageStaff": _rank(actor.role) >= _rank("system"),
        "isActivated": actor.is_activated,
    }


def enforce_report_scope(
    actor: Actor,
    requested_team: str | None = None,
) -> tuple[str | None, str | None]:
    """Enforce data scope for reports based on role.

    Returns (team_filter, sub_team_filter):
    - system: honour the requested team, no sub_team restriction
    - manager: force to actor's team (whole branch)
    - leader / sale: force to actor's team + sub_team
    """
    role = _normalize_role(actor.role)
    if role == "system":
        return (requested_team or "").strip() or None, None

    staff = actor.staff or {}
    actor_team = (staff.get("team") or "").strip()
    actor_sub = (staff.get("khoi") or "").strip()  # `khoi` = sub-team in `sales`

    if role == "manager" and actor_team:
        return actor_team, None
    if role in ("leader", "sale") and actor_team:
        return actor_team, actor_sub or None
    return (requested_team or "").strip() or None, None
