# pf-revenue — Quản lý Doanh thu

## Tech Stack
- **Frontend**: React 19 + Vite 8 + TypeScript 6 + Tailwind 3 + AG Grid Community 33
- **Backend**: Python / FastAPI (deployed on Render)
- **Database**: Supabase (Postgres + Auth) — project `jozcvbbypwvzaefteoxn`
- **Deploy**: Vercel (FE) + Render (BE)

## Running locally

```bash
# Frontend
cd frontend && npm install && npm run dev    # http://localhost:5174

# Backend
cd backend && pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Frontend needs `.env.local` with `VITE_API_BASE_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
Backend needs `.env` with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CORS_ORIGINS`.

## TypeScript check

```bash
cd frontend && npx tsc --noEmit
```

## Project Structure

### Frontend key files
- `frontend/src/components/PaymentsTab.tsx` — Main payments grid (worksheet-style, ~1700 lines)
- `frontend/src/pages/MainPage.tsx` — App shell with 4 views
- `frontend/src/layouts/AppShell.tsx` — Sidebar + header layout
- `frontend/src/components/AuthAccountsTab.tsx` — Auth accounts management
- `frontend/src/components/permissions/PermissionsTab.tsx` — RBAC matrix
- `frontend/src/hooks/useAuth.tsx` — Supabase auth state
- `frontend/src/hooks/useMe.tsx` — User profile + permissions
- `frontend/src/lib/api.ts` — Axios instance + auth interceptor

### Backend key files
- `backend/main.py` — FastAPI entry, CORS, Supabase client
- `backend/rbac.py` — Role hierarchy (sale < leader < manager < system), scope enforcement
- `backend/admin_routes.py` — /me, auth users, permissions CRUD
- `backend/payment_routes.py` — Payments CRUD, master data, filters
- `backend/payment_report_routes.py` — BCTB, team, channel reports, recon/internal
- `backend/payment_logic.py` — GMV calculation
- `backend/migrations/` — Versioned SQL: DDL tables + RPC functions (001–005)

### Full docs
- `docs/PROJECT.md` — Design spec, tech spec, API reference, progress tracking

## AG Grid Notes
- Using **Community** (free) tier — no enterprise context menu or range selection
- Custom clipboard: Ctrl+C copy cell value, Ctrl+V paste into editable field-based cells
- Undo/redo: `undoRedoCellEditing` enabled, limit 20 (Ctrl+Z / Ctrl+Y)
- Custom implementations: DatePickerEditor, CurrencyEditor, GridContextMenu, multi-row selection via config
- Worksheet-style UX: single-click edit, dropdown selectors, auto-save on blur
- 4 pinned (frozen) columns on desktop: Ngày, UID, Khách, Sale (unpinned on mobile)
- Mobile responsive: columns hidden/unpinned at ≤639px, summary cards stack vertically

## RBAC Model
- 4 roles: sale (1) < leader (2) < manager (3) < system (4)
- 4 departments: Bán hàng, Nhân sự, Marketing, CS
- Permission matrix: department × module → full / read / none
- Per-user overrides supported

## Business Logic
- GMV calculation: before 01/06/2026 uses `gmv_rmb`; after uses `real_pay_vnd / exchange_rate` (configurable via app_settings DB table, default 3700)
- GMV settings UI: manager/system roles can change exchange rate + cutoff date via ⚙ button
- Summary aggregation via Supabase RPC `payments_summary()` (not client-side)
- Internal reconciliation via RPC `get_payment_warnings()` — checks DUPLICATE, MISSING_DATA, ORPHAN_DATA, RATE_DEVIATION
- Quick filters on grid: "Chưa khớp NH" (bank_matched=false), "Chưa CRM" (crm_activated=false)
- Advanced filters: collapsible toolbar with Sale, Kênh, Gói dropdowns + date range — all server-side
- Search: full-text across uid, tên khách, SĐT, sale, kênh, gói, payment_seq, note, team — server-side
- Soft delete: `deleted_at` timestamp, filtered out in queries
- Pagination: 50 rows/page, server-side
