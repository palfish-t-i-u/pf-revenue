# pf-revenue — Quản lý Doanh thu

## 1. Tổng quan

App quản lý doanh thu (payments) tách riêng từ PalFish GMV Reconciliation. Mục tiêu: nhập/sửa doanh thu như Google Sheets, tự sinh báo cáo, đối soát ngân hàng & CRM.

| Hạng mục | Chi tiết |
|---|---|
| **Repo** | https://github.com/palfish-t-i-u/pf-revenue (private) |
| **Local** | `E:\PalFish\DA\pf-revenue` |
| **FE** | Vercel — React 19 + Vite 8 + Tailwind 3 + AG Grid Community |
| **BE** | Render — Python / FastAPI |
| **DB** | Supabase (dùng chung project `jozcvbbypwvzaefteoxn`) |
| **Auth** | Supabase Auth — email/password, dùng chung với GMV |

### Team

| Người | Vai trò |
|---|---|
| Minh | Lead — FE + BE payment routes + worksheet UX |
| Giang | rbac.py + admin_routes.py |
| Đạt | Deploy Render + Vercel, payment routes |
| Đức | SQL schema, migration |

### Lý do tách app

- GMV reconciliation đã quá lớn (~14 modules), khó maintain
- Team doanh thu cần tool riêng, deploy/iterate nhanh hơn
- Dùng chung Supabase project để tiết kiệm (không cần DB riêng)

---

## 2. Design Spec

### 2.1 Cấu trúc màn hình

```
┌─────────────────────────────────────────────────┐
│ Sidebar (collapsible)  │  Header (role, email)   │
│                        │                         │
│ DOANH THU              │  ┌─────────────────────┐│
│  ○ Quản lý Doanh thu   │  │ Sub-tabs:           ││
│                        │  │ [Doanh thu] [Báo cáo]│
│ HỆ THỐNG              │  │ [Đối soát] [Danh mục]│
│  ○ Tài khoản Auth      │  │                     ││
│  ○ Phân quyền          │  │ Content area        ││
│  ○ Thông tin cá nhân   │  │                     ││
│                        │  └─────────────────────┘│
└─────────────────────────────────────────────────┘
```

### 2.2 Module: Quản lý Doanh thu (`PaymentsTab`)

**Sub-tab: Doanh thu (Grid)** — Màn hình chính, dạng worksheet

- **Summary cards**: Tổng GMV, Doanh thu VNĐ, Số đơn, Chưa khớp NH, Chưa kích hoạt CRM
- **Toolbar**: [+ Thêm doanh thu] [Import từ file] [Xuất Excel] + search box
- **Team filter tabs**: Tất cả | In-house | In-house 2 | Offline | HCM
- **AG Grid** (worksheet-style):
  - 14 cột: Ngày, UID, Khách, Sale, Team, Kênh, Gói, VNĐ, GMV, Lần, TT, NH, CRM, Note
  - 4 cột đầu pinned (freeze) bên trái
  - Inline edit: single-click để edit, dropdown cho Sale/Kênh/Gói
  - Date picker: double-click cột Ngày mở calendar
  - Right-click context menu: Thêm doanh thu / Xóa dòng
  - Multi-row selection: Ctrl+Click chọn nhiều dòng, Delete xóa hàng loạt
  - Auto-save: edit xong blur là lưu ngay qua API
  - GMV logic: trước 01/06/2026 dùng gmv_rmb, sau đó tính = vnd / 3700
- **Pagination**: 50 dòng/trang, server-side

**Sub-tab: Báo cáo**

- BCTB: Pivot table sale × ngày → GMV
- Theo Team: Aggregate GMV/VNĐ/Số đơn per team
- Theo Kênh: Aggregate per channel
- Date range picker + Export Excel

**Sub-tab: Đối soát** — (placeholder, chưa implement)

**Sub-tab: Danh mục** — CRUD cho master data

- Sale: full_name, short_code, team, khối, active
- Kênh: channel_code, name, type
- Gói học: name, fixed
- Khách hàng: uid, full_name, phone (search)

### 2.3 Module: Tài khoản Auth

- Quản lý user đăng nhập (email/password)
- Liên kết CRM name
- Gán role (sale/leader/manager/system) + department
- Kích hoạt / khóa tài khoản
- Bulk delete

### 2.4 Module: Phân quyền

- Ma trận: 4 departments × 4 modules
- Access levels: full (toàn quyền) / read (chỉ xem) / none (ẩn)
- Override cá nhân: gán quyền riêng cho email cụ thể
- Click cycle: full → read → none → full

### 2.5 UX Guidelines (từ anh Hiếu)

- Phải giống Google Sheets: inline edit, add row, right-click menu
- Không dùng icon mơ hồ — mọi thao tác phải rõ ràng
- Bảng phải fit trong 1 trang, không scroll body
- Calendar picker cho cột ngày

---

## 3. Tech Spec

### 3.1 Frontend

```
frontend/
├── src/
│   ├── App.tsx                     # Routes: /, /login, /signup, /forgot-password
│   ├── main.tsx                    # Entry: BrowserRouter + AuthProvider + MeProvider
│   ├── pages/
│   │   ├── MainPage.tsx            # AppShell + 4 views (payments, auth, perms, profile)
│   │   ├── LoginPage.tsx
│   │   ├── SignUpPage.tsx
│   │   ├── ForgotPasswordPage.tsx
│   │   ├── PendingActivationPage.tsx
│   │   └── ProfilePage.tsx
│   ├── layouts/
│   │   └── AppShell.tsx            # Sidebar + header + mobile nav
│   ├── components/
│   │   ├── PaymentsTab.tsx         # ★ Main component (~1700 lines)
│   │   │   ├── GridSubTab          # AG Grid worksheet
│   │   │   ├── ReportsSubTab       # BCTB, Team, Channel reports
│   │   │   ├── ReconSubTab         # (placeholder)
│   │   │   └── MasterSubTab        # CRUD master data
│   │   ├── AuthAccountsTab.tsx
│   │   ├── auth/                   # Auth modals, drawers
│   │   ├── permissions/            # Permission matrix, override drawer
│   │   └── ui/                     # Badge, Button, Card, Input, Modal, Table, etc.
│   ├── hooks/
│   │   ├── useAuth.tsx             # Supabase auth state + dev mode
│   │   ├── useMe.tsx               # /me profile + permissions
│   │   ├── usePermission.ts        # Module-level access check
│   │   ├── useTeamScope.ts         # Team/subteam data scope
│   │   └── useRefetchOnFocus.ts    # Refetch on tab focus
│   ├── lib/
│   │   ├── api.ts                  # Axios instance + auth interceptor
│   │   ├── apiBaseUrl.ts           # Env-based API URL resolution
│   │   ├── supabase.ts             # Supabase client
│   │   ├── cn.ts                   # Tailwind class merge
│   │   └── vndFormat.ts
│   ├── types/
│   │   ├── permissions.ts          # AccessLevel, ModuleDef, DepartmentDef
│   │   └── profile.ts
│   ├── gmv-tokens.css              # Design tokens
│   ├── gmv-theme.css               # Theme classes
│   └── index.css                   # Tailwind base
├── package.json                    # React 19, AG Grid 33, Vite 8, TS 6
└── vite.config.ts
```

**Key dependencies:**

| Package | Version | Purpose |
|---|---|---|
| react | 19.2 | UI framework |
| ag-grid-community | 33.x | Data grid (free tier) |
| ag-grid-react | 33.x | React wrapper |
| @supabase/supabase-js | 2.106 | Auth + DB client |
| axios | 1.16 | HTTP client |
| react-router-dom | 7.15 | Routing |
| tailwindcss | 3.4 | CSS |
| vite | 8.x | Build tool |
| typescript | 6.x | Type checking |

**AG Grid Community limitations:**
- No clipboard module → custom copy/paste needed
- No Enterprise context menu → custom `GridContextMenu` component
- No range selection → `multiRow` mode with click selection
- No Excel export → custom export via API

### 3.2 Backend

```
backend/
├── main.py                     # FastAPI app, CORS, Supabase client
├── rbac.py                     # Actor resolution, role hierarchy, scope enforcement
├── admin_routes.py             # /me, /admin/* (auth users, permissions, sales)
├── payment_routes.py           # /api/v1/payments/* (CRUD, patch, refund, import)
├── payment_report_routes.py    # /api/v1/reports/* (BCTB, team, channel)
├── payment_logic.py            # GMV calculation, business rules
├── analytics_limits.py         # Query limits, row-capped fetching
├── sheet_row_parsers.py        # GSheet import row parsing
├── migrate_gsheet.py           # One-time GSheet → Supabase migration
└── requirements.txt            # FastAPI, Supabase, httpx, openpyxl
```

**API Endpoints:**

| Method | Path | Mô tả |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/me` | Current user profile + permissions |
| PATCH | `/me` | Update profile |
| GET | `/api/v1/payments` | List payments (paginated, filtered) |
| POST | `/api/v1/payments` | Create payment |
| PATCH | `/api/v1/payments/:id` | Update payment fields |
| DELETE | `/api/v1/payments/:id` | Soft delete payment |
| POST | `/api/v1/payments/:id/refund` | Mark as refunded |
| POST | `/api/v1/payments/:id/restore` | Restore from refunded |
| POST | `/api/v1/payments/:id/link-crm` | Link CRM order |
| POST | `/api/v1/payments/import` | Import from Excel/CSV |
| GET | `/api/v1/payments/export` | Export to Excel |
| GET | `/api/v1/payments/master/sales` | List sales |
| GET | `/api/v1/payments/master/channels` | List channels |
| GET | `/api/v1/payments/master/packages` | List packages |
| POST | `/api/v1/payments/master/:type` | Create master record |
| PATCH | `/api/v1/payments/master/customers/:uid` | Update customer |
| GET | `/api/v1/customers/search` | Search customers |
| GET | `/api/v1/reports/bctb` | BCTB pivot report |
| GET | `/api/v1/reports/team` | Team aggregate report |
| GET | `/api/v1/reports/channel` | Channel aggregate report |
| GET | `/admin/auth-users` | List auth users |
| POST | `/admin/auth-users` | Create auth user |
| PATCH | `/admin/auth-users/:id` | Update auth user |
| POST | `/admin/auth-users/bulk-delete` | Bulk delete |
| GET | `/admin/permissions` | Get permission matrix |
| PATCH | `/admin/permissions` | Update permission cell |
| POST | `/admin/permissions/seed` | Seed default permissions |

**RBAC Model:**

```
Role hierarchy: sale (1) < leader (2) < manager (3) < system (4)
Data scope:
  - system: all data
  - manager: own team
  - leader/sale: own team + sub-team (khối)
```

### 3.3 Database Schema

Supabase project: `jozcvbbypwvzaefteoxn` (dùng chung với GMV)

**Core tables:**

| Table | Rows | PK | Mô tả |
|---|---|---|---|
| `customers` | ~10K | uid (text) | Khách hàng |
| `sales` | ~200 | id (uuid) | Nhân viên bán hàng |
| `channels` | ~34 | id (uuid) | Kênh bán hàng |
| `packages` | ~153 | id (uuid) | Gói học |
| `payments` | ~15K | payment_id (uuid) | Doanh thu (bảng chính) |
| `bank_transactions` | — | txn_id (uuid) | Giao dịch ngân hàng |
| `crm_orders` | — | crm_order_id (text) | Đơn CRM |

**System tables:**

| Table | Mô tả |
|---|---|
| `department_permissions` | Ma trận phòng ban × module |
| `permission_overrides` | Override quyền cá nhân |

**payments columns:**

```sql
payment_id    uuid PK
uid           text FK → customers
pay_time      timestamptz
real_pay_vnd  numeric
gmv_rmb       numeric (nullable, dùng trước 01/06/2026)
gmv_final     numeric (computed)
sale_id       uuid FK → sales
team          text
channel_id    uuid FK → channels
package_id    uuid FK → packages
payment_seq   text
status        text (active / refunded)
bank_matched  boolean
crm_activated boolean
crm_order_id  text
note          text
deleted_at    timestamptz (soft delete)
created_at    timestamptz
updated_at    timestamptz
```

**RPC function:**

- `payments_summary(...)` — Server-side aggregate thay vì fetch all rows. Trả về count, gmv_final, real_pay_vnd, unmatched_bank, uncrm. Hỗ trợ filter theo search, date range, team, channel, sale, status.

### 3.4 Deployment

| Component | Platform | URL |
|---|---|---|
| Frontend | Vercel | (chưa có custom domain) |
| Backend | Render | (chưa có custom domain) |
| Database | Supabase | jozcvbbypwvzaefteoxn.supabase.co |

**Env vars (Frontend):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL` (localhost:8000 dev / Render URL prod)

**Env vars (Backend):**
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CORS_ORIGINS`
- `SYSTEM_ADMIN_EMAILS`

---

## 4. Tiến độ công việc

### DONE

| # | Hạng mục | Ngày | Chi tiết |
|---|---|---|---|
| 1 | Scaffold FE | 06/06 | React 19 + Vite 8 + Tailwind + AG Grid, copy từ GMV |
| 2 | Shared FE infra | 06/06 | lib, hooks, types, UI components từ GMV |
| 3 | Auth & permissions pages | 06/06 | Login, signup, forgot-password, auth accounts, permission matrix |
| 4 | AppShell + MainPage + routing | 06/06 | Sidebar (4 items), header, mobile nav |
| 5 | PaymentsTab (grid + reports + master) | 06/06 | Copy từ archive branch, fix imports |
| 6 | Scaffold BE | 06/06 | FastAPI + rbac + admin + payment routes |
| 7 | Database setup | 06/06 | Dùng chung Supabase project_palfish, 9 tables |
| 8 | Data migration | 06/06 | 15K payments + master data từ sandbox |
| 9 | Deploy FE + BE | 06/07 | Vercel (FE) + Render (BE) — Đạt handle |
| 10 | Performance fix: summary RPC | 06/08 | Tạo `payments_summary()` RPC thay vì fetch 15K rows |
| 11 | AG Grid worksheet UX | 06/08 | Inline edit, dropdowns, freeze columns, fit viewport |
| 12 | GSheet-like features | 06/08 | Calendar date picker, right-click context menu, multi-row select, simple add row |

### TODO

| # | Hạng mục | Ưu tiên | Chi tiết |
|---|---|---|---|
| T1 | Đối soát ngân hàng (sub-tab) | Cao | Upload bank statement → match với payments |
| T2 | CRM activation sync | Cao | Link crm_order_id, mark crm_activated |
| T3 | Import từ file (API) | Trung bình | POST /payments/import — Đức cần deploy endpoint |
| T4 | Export Excel (API) | Trung bình | GET /payments/export — cần BE endpoint |
| T5 | Tỷ giá GMV dynamic | Thấp | In-app config thay vì hard-code 3700 |
| T6 | Clipboard (copy/paste cells) | Thấp | Custom implementation (AG Grid Community không có) |
| T7 | Undo/redo history | Thấp | AG Grid có undoRedoCellEditing, cần test kỹ |
| T8 | Mobile responsive grid | Thấp | Hiện chỉ ổn trên desktop |

### Known Issues

- `.env.local` đang trỏ `localhost:8000` — cần đổi về Render URL trước khi deploy
- Backend hay die trên localhost (cần restart manual)
- AG Grid `suppressContextMenu` có thể là Enterprise-only — đã có fallback `onContextMenu` trên wrapper div
- 401 errors nếu thiếu Supabase env vars trong `.env.local`

---

## 5. Cách chạy local

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5174
```

Cần file `.env.local`:
```
VITE_API_BASE_URL=http://localhost:8000
VITE_SUPABASE_URL=https://jozcvbbypwvzaefteoxn.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Cần file `.env`:
```
SUPABASE_URL=https://jozcvbbypwvzaefteoxn.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
CORS_ORIGINS=http://localhost:5174
```

### TypeScript check

```bash
cd frontend && npx tsc --noEmit
```
