# Handoff: Backend pf-revenue (App Quản lý Doanh Thu)

> **Cập nhật**: 2026-06-08 (v2 — gộp Supabase vào project_palfish)
> **Người giao**: Minh
> **Repo**: https://github.com/palfish-t-i-u/pf-revenue (private)
> **Supabase**: `project_palfish` (`jozcvbbypwvzaefteoxn`) — dùng chung với GMV
> **Design spec**: `docs/superpowers/specs/2026-06-08-pf-revenue-standalone-app-design.md`

---

## Bối cảnh

Module Quản lý Doanh Thu đã tách khỏi app GMV thành app riêng. FE đã scaffold xong, BE cần hoàn thiện.

**Khác biệt so với handoff v1:**
- Supabase dùng chung `project_palfish` (không tạo project riêng) → tiết kiệm $10/tháng
- Auth users dùng chung → không cần tạo lại
- Data import fresh từ All File Thu Hiền qua app, không migrate từ GMV
- BE-3/4/5 Minh đã làm xong, code nằm trên repo

**Lưu ý quan trọng về schema:**
- Bảng `payments`, `customers`, `sales`, `channels`, `packages` là **bảng MỚI** — không phải `so_doanh_thu`, `khach_hang`, `nhan_su_sale` của GMV
- Bảng `department_permissions` và `permission_overrides` **đã có sẵn** từ GMV — chỉ thêm rows
- Cột permission dùng `access_level` (không phải `access`), `user_email` (không phải `email`)

---

## Tổng quan

| # | Việc | PIC | Trạng thái |
|---|------|-----|------------|
| BE-1 | Copy + sửa `rbac.py` | **Giang** | 🔄 Đang làm |
| BE-2 | Copy + sửa `admin_routes.py` | **Giang** | 🔄 Đang làm |
| BE-3 | Copy payment routes từ archive | ~~Đạt~~ | ✅ Minh đã làm |
| BE-4 | Copy utilities từ archive | ~~Đạt~~ | ✅ Minh đã làm |
| BE-5 | Viết `main.py` + `requirements.txt` | ~~Giang~~ | ✅ Minh đã làm |
| BE-6 | Chạy SQL tạo 7 bảng + seed permissions | **Đức** | ⏳ |
| BE-9 | Deploy lên Render | **Đạt** | ⏳ Chờ Giang xong |
| FE-7 | Deploy FE lên Vercel | **Đạt** | ⏳ |

**Đã bỏ:** BE-7 (migration — import fresh), BE-8 (auth — dùng chung)

---

## BE-1: Copy + sửa `rbac.py` (Giang)

### Source
```
git show payments-module-archive:backend/rbac.py
```

### Cần sửa

**1. `_lookup_staff()` — đổi `nhan_su_sale` → `sales`**

```python
# CŨ (GMV):
res = sb.table("nhan_su_sale").select("*").eq("email", email).limit(1).execute()

# MỚI:
res = sb.table("sales").select("*").eq("email", email).limit(1).execute()
```

**2. `staff_to_profile()` — mapping cột mới**

| GMV (`nhan_su_sale`) | App mới (`sales`) |
|----------------------|-------------------|
| `crm_name` | `full_name` |
| `display_name` | `full_name` |
| `sub_team` | `khoi` |
| `is_active` | `active` |

```python
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
```

**3. Xóa** `visible_creator_emails()`, `scope_sale_names()`, import `vn_staff`

### Giữ nguyên
`ROLE_RANK`, `Actor`, `resolve_actor()`, `require_min_role()`, `_extract_bearer()`, `_auth_user_from_jwt()`, `enforce_report_scope()`

---

## BE-2: Copy + sửa `admin_routes.py` (Giang)

### Source
Copy từ GMV: `backend/admin_routes.py`

### Cần sửa

**1. `MODULE_LIST` — 14 → 4**
```python
MODULE_LIST = ["payments", "authAccounts", "permissions", "profile"]
```

**2. `DEFAULT_DEPT_PERMISSIONS` — 4 × 4**
```python
DEFAULT_DEPT_PERMISSIONS = {
    "sale":      {"payments": "none", "authAccounts": "none", "permissions": "none", "profile": "full"},
    "hr":        {"payments": "full", "authAccounts": "full", "permissions": "full", "profile": "full"},
    "marketing": {"payments": "none", "authAccounts": "none", "permissions": "none", "profile": "full"},
    "cs":        {"payments": "none", "authAccounts": "none", "permissions": "none", "profile": "full"},
}
```

**3. Đổi tên bảng** `nhan_su_sale` → `sales` (tất cả `sb.table("nhan_su_sale")`)

**4. Mapping cột** (giống BE-1): `crm_name` → `full_name`, `is_active` → `active`, `sub_team` → `khoi`

**5. Xóa** `from vn_staff import is_vn_sale_row` + tất cả chỗ gọi `is_vn_sale_row()`

**6. Cột permission — QUAN TRỌNG:**
- Bảng `department_permissions`: cột là `access_level` (không phải `access`), có thêm cột `min_role`
- Bảng `permission_overrides`: cột là `user_email` (không phải `email`), `access_level` (không phải `access`)
- Kiểm tra code GMV hiện tại đã dùng đúng tên cột chưa trước khi copy

### Giữ nguyên
`/me`, `/me PATCH`, `/admin/auth-users` CRUD, `/admin/permissions/*`, `require_module_access()`, `_compute_permissions()`, `DEPARTMENT_ALIASES`

---

## BE-6: Tạo SQL schema trong project_palfish (Đức)

### Hướng dẫn

1. Vào https://supabase.com/dashboard → chọn project `project_palfish`
2. Vào **SQL Editor** (menu trái)
3. Paste và chạy SQL bên dưới

### SQL — Tạo 7 bảng mới

```sql
-- ═══════════════════════════════════════════
-- 7 BẢNG MỚI CHO MODULE DOANH THU
-- (không ảnh hưởng bảng GMV hiện có)
-- ═══════════════════════════════════════════

create table customers (
  uid         text primary key,
  full_name   text,
  phone       text,
  first_seen  date,
  created_at  timestamptz default now()
);

create table sales (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null,
  short_code  text,
  email       text,
  team        text,
  khoi        text,
  role        text default 'sale',
  active      boolean default true,
  created_at  timestamptz default now()
);
create index on sales (email);

create table channels (
  id            uuid primary key default gen_random_uuid(),
  channel_code  text,
  name          text,
  type          text
);

create table packages (
  id     uuid primary key default gen_random_uuid(),
  name   text not null,
  fixed  text
);

create table payments (
  payment_id    uuid primary key default gen_random_uuid(),
  uid           text not null references customers(uid),
  pay_time      timestamptz not null,
  bank_day      date,
  package_id    uuid references packages(id),
  payment_seq   text,
  real_pay_vnd  numeric not null,
  gmv_rmb       numeric,
  gmv_final     numeric,
  channel_id    uuid references channels(id),
  sale_id       uuid not null references sales(id),
  team          text not null,
  status        text not null default 'active',
  note          text,
  crm_order_id  text,
  crm_activated boolean not null default false,
  activated_at  date,
  bank_matched  boolean not null default false,
  deleted_at    timestamptz,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);
create index on payments (pay_time);
create index on payments (uid);
create index on payments (sale_id);
create unique index payments_bizkey
  on payments (uid, pay_time, real_pay_vnd)
  where deleted_at is null;

-- Phase 2
create table bank_transactions (
  txn_id             uuid primary key default gen_random_uuid(),
  date               date,
  amount             numeric,
  content            text,
  matched_payment_id uuid references payments(payment_id)
);

create table crm_orders (
  crm_order_id text primary key,
  uid          text references customers(uid),
  course       text,
  activated    boolean,
  activated_at date
);

-- ═══════════════════════════════════════════
-- RLS
-- ═══════════════════════════════════════════
alter table customers enable row level security;
alter table sales enable row level security;
alter table channels enable row level security;
alter table packages enable row level security;
alter table payments enable row level security;
alter table bank_transactions enable row level security;
alter table crm_orders enable row level security;
```

### SQL — Seed permissions (chạy riêng sau khi tạo bảng)

Bảng `department_permissions` đã có sẵn từ GMV. Chỉ thêm rows cho 2 module_key mới (`payments`, `permissions`). Module `authAccounts` và `profile` đã có.

```sql
INSERT INTO department_permissions (department, module_key, access_level, min_role) VALUES
  ('sale', 'payments', 'none', 'sale'),
  ('sale', 'permissions', 'none', 'sale'),
  ('hr', 'payments', 'full', 'sale'),
  ('hr', 'permissions', 'full', 'sale'),
  ('marketing', 'payments', 'none', 'sale'),
  ('marketing', 'permissions', 'none', 'sale'),
  ('cs', 'payments', 'none', 'sale'),
  ('cs', 'permissions', 'none', 'sale');
```

### Verify

Chạy sau khi xong:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('customers','sales','channels','packages','payments','bank_transactions','crm_orders')
ORDER BY table_name;
-- Kỳ vọng: 7 bảng

SELECT module_key, count(*) FROM department_permissions
WHERE module_key IN ('payments', 'permissions')
GROUP BY module_key;
-- Kỳ vọng: payments=4, permissions=4
```

---

## BE-9: Deploy lên Render (Đạt)

### Bước 1: Tạo Web Service

1. Vào https://dashboard.render.com → **New** → **Web Service**
2. Connect GitHub repo `palfish-t-i-u/pf-revenue`
3. Cấu hình:
   - **Name**: `pf-revenue-api`
   - **Root directory**: `backend`
   - **Runtime**: Python
   - **Build command**: `pip install -r requirements.txt`
   - **Start command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Bước 2: Set env vars

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | `https://jozcvbbypwvzaefteoxn.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | *(hỏi Minh lấy từ Supabase Dashboard → Settings → API)* |
| `CORS_ORIGINS` | `http://localhost:5174,https://pf-revenue.vercel.app` |
| `SYSTEM_ADMIN_EMAILS` | `anhminhcv0512@gmail.com` |
| `APP_ENV` | `production` |

### Bước 3: Verify

Đợi deploy xong (~3-5 phút), test:
```
GET https://pf-revenue-api.onrender.com/health
→ {"status":"ok"}
```

---

## FE-7: Deploy FE lên Vercel (Đạt)

### Bước 1: Import project

1. Vào https://vercel.com/new
2. Import repo `palfish-t-i-u/pf-revenue`
3. Cấu hình:
   - **Framework**: Vite
   - **Root directory**: `frontend`
   - **Build command**: `npm run build`
   - **Output directory**: `dist`

### Bước 2: Set env vars

| Key | Value |
|-----|-------|
| `VITE_SUPABASE_URL` | `https://jozcvbbypwvzaefteoxn.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | *(hỏi Minh)* |
| `VITE_API_BASE_URL` | `https://pf-revenue-api.onrender.com` |

### Bước 3: Verify

Mở URL Vercel → trang login hiện → đăng nhập bằng tài khoản GMV hiện có.

---

## Dependency

```
BE-1 (Giang: rbac.py)
  ↓
BE-2 (Giang: admin_routes.py)
  ↓                              BE-6 (Đức: SQL tạo bảng) ← làm song song
  ↓                                ↓
BE-9 (Đạt: deploy Render) ← chờ Giang + Đức xong
  ↓
FE-7 (Đạt: deploy Vercel) ← chờ Render URL
```

---

## Checklist trước khi báo hoàn thành

- [ ] 7 bảng mới tạo xong trên Supabase, RLS bật
- [ ] `department_permissions` có thêm 8 rows cho `payments` + `permissions`
- [ ] `uvicorn main:app --reload` chạy không lỗi import
- [ ] `GET /health` → `{"status":"ok"}`
- [ ] `GET /me` với Bearer token → profile + permissions
- [ ] Render deploy OK, health check pass
- [ ] Vercel deploy OK, login page hiện, đăng nhập được
