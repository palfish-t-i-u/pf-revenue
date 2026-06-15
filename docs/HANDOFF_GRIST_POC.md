# Handoff: POC Grist self-host cho pf-revenue

> **Ngày giao**: 2026-06-15
> **Người giao**: Minh
> **Người nhận**: Đạt
> **Nguồn quyết định**: Họp anh Hiếu 11/06 + kết quả POC Lark Base 14-15/06
> **Tài liệu liên quan**:
> - `docs/PROJECT.md` — spec đầy đủ app hiện tại
> - `docs/HANDOFF_RESEARCH_PLATFORM.md` — research nền tảng (hard gates, kịch bản POC)
> - Lark Base POC: workspace PalFish Revenue Manager (đã build 14-15/06, dùng làm baseline so sánh)

---

## 1. Bối cảnh

Sau POC Lark Base (14-15/06), team đứng trước 2 lựa chọn:
- **Lark Pro**: 18-180M VNĐ/năm tùy số editor, UX đẹp, data ở ByteDance cloud (rủi ro PII VN PDPL 2025)
- **Grist self-host**: ~60M VNĐ/năm hosting + 1-2 tuần dev, kiểm soát data 100%

Anh Hiếu cần thấy POC Grist trên data thật để so sánh trực tiếp với POC Lark, rồi mới duyệt budget.

**Đạt được giao build POC Grist** vì:
- Hướng "kiểm soát data" anh Hiếu thiên về (Q3 — HANDOFF_RESEARCH_PLATFORM mục 2)
- Self-host = không lock-in vendor, dev/ops trong tầm tay team
- POC này = đối thủ trực tiếp của Lark POC trong báo cáo cuối anh Hiếu duyệt

**Mục tiêu cụ thể**:
1. Build POC Grist local trên máy Đạt (không tốn VPS giai đoạn này)
2. Import full 15K rows từ Supabase prod, đáp ứng tất cả hard gates (mục 4.1 HANDOFF_RESEARCH)
3. Demo được trên Zoom/Meet với anh Hiếu (screen share hoặc ngrok)
4. Báo cáo so sánh Lark vs Grist (kèm screenshot, cost, trade-off)

**Không phải mục tiêu giai đoạn này**:
- Production deployment (VPS, SSL, monitoring) — chỉ làm sau khi anh Hiếu duyệt
- Multi-user concurrent test với 50 user thật — POC chứng minh feasibility là đủ
- Hardening security toàn diện — local Docker, demo xong tắt

---

## 2. Setup local Docker — 5 phút

### 2.1 Yêu cầu máy Đạt

| Hạng mục | Tối thiểu | Khuyến nghị |
|---|---|---|
| OS | Windows 10/11 + WSL2, hoặc macOS, hoặc Linux | Linux/macOS |
| RAM | 8 GB | 16 GB |
| Disk | 10 GB free | 20 GB SSD |
| Docker Desktop | ≥ 4.20 | latest |
| Internet | Có (để pull image + ngrok) | |

### 2.2 Lệnh setup tối giản

Tạo thư mục `~/grist-poc` rồi chạy:

```bash
mkdir -p ~/grist-poc/persist
cd ~/grist-poc

docker run -d \
  --name grist-poc \
  -p 8484:8484 \
  -e GRIST_SESSION_SECRET="$(openssl rand -hex 32)" \
  -e GRIST_SINGLE_ORG=palfish \
  -e GRIST_DEFAULT_EMAIL=dat@palfish.local \
  -v "$PWD/persist:/persist" \
  --restart unless-stopped \
  gristlabs/grist:latest
```

Mở `http://localhost:8484` → đăng nhập email `dat@palfish.local` (mode single-org, không cần password) → vào ngay.

**Tham số quan trọng**:
- `GRIST_SESSION_SECRET`: random 32 byte hex, bắt buộc cho session encryption
- `GRIST_SINGLE_ORG=palfish`: chế độ single-org đơn giản, đủ cho POC (không cần multi-tenant)
- `GRIST_DEFAULT_EMAIL`: email admin mặc định, tự động đăng nhập
- `-v $PWD/persist:/persist`: mount folder local → mọi data + doc lưu ở `~/grist-poc/persist`, không mất khi `docker rm`

### 2.3 Docker Compose — option khuyến nghị

Tạo `~/grist-poc/docker-compose.yml`:

```yaml
services:
  grist:
    image: gristlabs/grist:latest
    container_name: grist-poc
    ports:
      - "8484:8484"
    environment:
      GRIST_SESSION_SECRET: "REPLACE_WITH_RANDOM_HEX_32"
      GRIST_SINGLE_ORG: palfish
      GRIST_DEFAULT_EMAIL: dat@palfish.local
      GRIST_TELEMETRY_LEVEL: "off"
      GRIST_DATA_DIR: /persist
    volumes:
      - ./persist:/persist
    restart: unless-stopped
```

Chạy: `docker compose up -d`
Dừng: `docker compose down` (data vẫn còn)
Xóa hẳn: `docker compose down -v && rm -rf persist` (mất sạch — cẩn thận)

### 2.4 Kiểm tra

```bash
docker logs grist-poc
# tìm dòng "Server listening on 0.0.0.0:8484"

curl http://localhost:8484/status
# trả về JSON {"status": "ok", ...}
```

---

## 3. Demo workflow — 3 cách

POC chỉ chạy local máy Đạt, không cần VPS. Khi cần demo:

### 3.1 Option A — Screen share (đơn giản nhất)

- Đạt mở `http://localhost:8484` trên máy mình
- Share màn hình qua Zoom/Meet/Lark Meeting
- Phù hợp: demo cho anh Hiếu nội bộ, demo 1-1 với Minh
- Ưu: 0 config, kiểm soát hoàn toàn
- Nhược: anh Hiếu không click thử được

### 3.2 Option B — ngrok tunnel (anh Hiếu click thử)

Cài ngrok (free tier): https://ngrok.com/download

```bash
# terminal riêng
ngrok http 8484
# → ra URL kiểu https://abc123.ngrok-free.app
```

- Gửi URL cho anh Hiếu click test → expose tạm thời 2 tiếng (free tier)
- Phù hợp: demo cần tương tác, anh Hiếu muốn tự thử nhập liệu
- Ưu: zero infra, ai có link cũng xem được
- Nhược: free tier random subdomain mỗi lần, expose data ra ngoài tạm thời

⚠️ **Bảo mật khi dùng ngrok**:
- Bật `GRIST_FORCE_LOGIN=true` để chặn truy cập anonymous
- Tắt ngrok ngay sau demo (`Ctrl+C`)
- Không để chạy qua đêm — URL public, ai biết có thể truy cập

### 3.3 Option C — LAN nội bộ (cùng văn phòng)

Tìm IP máy Đạt:
```bash
# macOS / Linux
ifconfig | grep "inet "
# Windows
ipconfig
```

Cho team truy cập `http://192.168.x.x:8484` cùng wifi.
- Phù hợp: demo nhóm tại văn phòng, không cần internet
- Ưu: nhanh, không qua bên thứ 3
- Nhược: chỉ trong LAN

### 3.4 Khuyến nghị

- **Demo anh Hiếu**: Option A (screen share) — control dramaturgy
- **Anh Hiếu muốn tự thử**: Option B (ngrok 30 phút)
- **Demo cả team kế toán**: Option C (LAN văn phòng)

---

## 4. Persist & backup

### 4.1 Cấu trúc folder persist

```
~/grist-poc/persist/
├── docs/                    # các Grist document (.grist file)
│   ├── PalFish_Revenue.grist
│   └── ...
├── attachments/             # file upload
├── grist-sessions.db        # session storage
└── home.sqlite3             # metadata + user/org
```

### 4.2 Backup thủ công (POC stage)

Cuối ngày làm việc:
```bash
cd ~/grist-poc
tar czf "backup-$(date +%Y%m%d-%H%M).tar.gz" persist/
# Upload backup-*.tar.gz lên Google Drive / Dropbox cá nhân
```

### 4.3 Export Grist document → file `.grist`

Trong UI: top right → menu doc → **Manage → Download** → file `.grist` (SQLite, mở được bằng Grist khác).

Đây là escape hatch quan trọng: file `.grist` portable, di chuyển sang máy khác/VPS chỉ cần copy vào folder `persist/docs/`.

### 4.4 Lưu ý quan trọng

- **Đừng** `docker rm -v grist-poc` — flag `-v` xóa volume kèm
- **Đừng** xóa folder `persist/` khi container đang chạy → corrupt SQLite
- Tắt máy / restart: container `restart: unless-stopped` sẽ tự lên lại
- Backup `.grist` ít nhất 1 lần/ngày khi đang build POC (tránh mất công xây schema)

---

## 5. Import data từ Supabase prod → Grist

### 5.1 Chuẩn bị data

Hỏi Minh:
- File Excel export từ app: `GET /api/v1/payments/export` (cần token system role)
- Hoặc Minh chạy SQL trên Supabase Studio → export CSV từng bảng

Cần export 6 file CSV:
- `payments.csv` (~15,106 rows)
- `customers.csv` (~9,982 rows)
- `sales.csv` (~199 rows)
- `channels.csv` (~16 rows)
- `packages.csv` (~153 rows)
- `app_settings.csv` (~5 rows — chứa `gmv_exchange_rate`, `gmv_cutoff_date`)

### 5.2 Tạo Grist document

1. Top right → **Add New → Empty document** → đặt tên `PalFish Revenue POC`
2. Vào doc → menu top **Add New → Import from file** → chọn `customers.csv`
3. Lặp lại cho 5 file còn lại, **import master data trước**, payments cuối cùng

### 5.3 Map quan hệ thành Reference column

Sau khi import xong, payments có các cột text `sale`, `channel`, `package`, `customer_uid`. Cần convert thành **Reference** (giống linked record của Lark):

1. Vào bảng `Payments` → chọn cột `sale_id` (hoặc tên Minh export)
2. Bên phải Column options → **Column type → Reference → Sales** → field shown: `full_name`
3. Lặp tương tự:
   - `channel_id` → Reference `Channels` → `name`
   - `package_id` → Reference `Packages` → `name`
   - `customer_uid` → Reference `Customers` → `uid` hoặc `full_name`

Grist sẽ tự match value text với Sales/Channels/... và tạo reference. Nếu không match (sai chính tả) → Grist tạo record mới hoặc để empty (config được).

### 5.4 Kiểm tra số liệu

So với prod Supabase:
- Tổng GMV (RMB): ~43.8M (đã verify match prod trong POC Lark)
- Tổng VNĐ: ~155 tỷ
- Số đơn active: 15,106 (sau dedup)
- Sales: 199 / Channels: 16 / Packages: 153 / Customers: 9,982

Nếu Grist hiện đúng các số này → import OK.

---

## 6. Implement spec — mapping từng yêu cầu

Đây là phần lớn nhất của handoff. Mỗi mục dưới đây cover 1 yêu cầu spec, kèm cách làm cụ thể trên Grist.

### 6.1 Schema 6 bảng

Tham khảo `docs/PROJECT.md` mục 3.3 (Database Schema). Tóm tắt:

**Bảng Payments** (14 cột):

| Cột Grist | Type | Ghi chú |
|---|---|---|
| `date` | Date | format `DD/MM/YYYY` |
| `uid` | Text | UID khách hàng (link Customers) |
| `customer_id` | Reference → Customers | hiển thị `full_name` |
| `sale_id` | Reference → Sales | hiển thị `full_name` |
| `team` | Choice | options: `In-house`, `In-house 2`, `Offline`, `HCM` |
| `channel_id` | Reference → Channels | hiển thị `name` |
| `package_id` | Reference → Packages | hiển thị `name` |
| `real_pay_vnd` | Numeric | format `#,##0 ₫` |
| `gmv_rmb` | Numeric | input thủ công (legacy < 01/06) |
| `gmv` | Numeric (Formula) | xem 6.4 |
| `payment_seq` | Int | lần thanh toán |
| `status` | Choice | `active`, `refunded` |
| `bank_matched` | Toggle | checkbox |
| `crm_activated` | Toggle | checkbox |
| `note` | Text | |
| `deleted_at` | DateTime | soft delete |
| `created_at` | DateTime | auto |
| `updated_at` | DateTime | auto |

**Master tables**:
- `Sales`: full_name, short_code, team (Choice), khoi, active
- `Channels`: channel_code, name, type
- `Packages`: name, fixed
- `Customers`: uid (Text, unique), full_name, phone

**Settings**:
- `AppSettings`: key (Text), value (Text), updated_at — chứa `gmv_exchange_rate=3700`, `gmv_cutoff_date=2026-06-01`

### 6.2 Worksheet UX checklist (W1-W10)

Đây là **acceptance criteria chính** anh Hiếu chốt. Mỗi mục test trong Grist:

| # | Spec | Cách làm Grist | Pass/Fail dự kiến |
|---|---|---|---|
| W1 | Thêm 1 dòng / nhiều dòng | Click "+" cuối bảng / chọn dòng + `Ctrl+Shift+Enter` | ✅ Pass |
| W2 | Inline edit | Click ô là nhập ngay | ✅ Pass |
| W3 | Bộ lọc cứng + tạm thời | Filter cứng: tạo **View** mới có filter saved. Filter tạm: click cột → Filter → tắt là mất | ✅ Pass |
| W4 | Xóa 1/nhiều dòng | Chọn dòng (Shift+Click) → Delete | ✅ Pass |
| W5 | Bulk edit nhiều dòng | Chọn dòng → right-click → "Apply Bulk Action" hoặc paste cùng value cho nhiều ô | ⚠️ Test kỹ — Grist không có "edit cell apply to selection" như AG Grid |
| W6 | Data validation theo cột | Column type (Date/Numeric/Choice/Reference) tự ràng buộc. Validation rule phức tạp hơn → dùng formula `Conditional Style` hoặc Access Rule | ✅ Pass cơ bản |
| W7 | Copy/paste từ Excel, undo/redo | `Ctrl+C` từ Excel → click vùng Grist → `Ctrl+V`. Undo: `Ctrl+Z` | ✅ Pass |
| W8 | Dropdown + date picker | Reference column tự ra dropdown. Date column tự có picker | ✅ Pass |
| W9 | Freeze 4 cột đầu | Click cột → "Freeze 4 columns" (right-click header) | ✅ Pass |
| W10 | Right-click menu + auto-save | Right-click ô / dòng có menu. Auto-save mặc định | ✅ Pass |

**Tập trung test W3 và W5** — đây là 2 mục hay fail với platform khác.

### 6.3 Phân quyền (Access Rules)

Đây là **hard gate khó nhất**. Grist dùng cú pháp Python expression cho Access Rules. Document → **Access Rules** (menu icon khóa).

**Role model**:
- 4 role: `sale` (1), `leader` (2), `manager` (3), `system` (4)
- 4 phòng: Bán hàng, Nhân sự, Marketing, CS

Trong Grist, mỗi user có `user.Email`. Cần tạo 1 bảng `Users`:
- `email`, `full_name`, `role`, `department`, `team`, `khoi`, `active`

Sau đó dùng `user.Email` trong Access Rule để lookup role.

#### Setup User Attributes

**Access Rules → User Attributes** → tạo attribute:
- Name: `User`
- Lookup table: `Users`
- Lookup column: `email`
- Match against: `user.Email`

Sau đó trong rule có thể dùng `user.User.role`, `user.User.team`, `user.User.department`.

#### Rule: Sale chỉ thấy dòng team của mình

**Table Rules** → Payments → Add rule:
- **Match Condition**: `user.User.role == "sale" and rec.team != user.User.team`
- **Permissions**: ❌ Read, ❌ Update, ❌ Create, ❌ Delete

Tức là: nếu user là sale VÀ row có team khác team user → cấm xem.

#### Rule: Manager thấy team mình + read-all

- **Match**: `user.User.role == "manager" and rec.team != user.User.team`
- **Permissions**: ✅ Read, ❌ Update, ❌ Create, ❌ Delete (manager xem được team khác, chỉ sửa team mình)

#### Rule: Sale không sửa được cột GMV

**Column Rules** → Payments.gmv → Add rule:
- **Match**: `user.User.role == "sale"`
- **Permissions**: ✅ Read, ❌ Update

#### Rule: Phòng Marketing không thấy module doanh thu

**Table Rules** → Payments → Add rule (đặt trước rule sale):
- **Match**: `user.User.department == "Marketing"`
- **Permissions**: ❌ all

(Tương tự Nhân sự, CS nếu không cần xem doanh thu)

#### Rule: System / role 4 thấy hết

Mặc định owner / `user.Access in ("owners",)` thấy hết. Đảm bảo system role được cấp role `owners` trong sharing.

#### Test acceptance

Tạo 4 user thật trong bảng `Users`:
- `sale.inhouse@test.local` — role=sale, team=In-house
- `manager.inhouse@test.local` — role=manager, team=In-house
- `system@test.local` — role=system
- `viewer.boss@test.local` — role=viewer (Marketing dept, chỉ xem report)

Share document cho từng email (Doc Settings → Sharing → Add user). Đăng nhập từng email kiểm tra scope.

⚠️ **Grist Access Rules dùng expression Python eval** — cú pháp khó hơn Lark UI checkbox. Đây là điểm Đạt cần đầu tư nhiều thời gian nhất.

Docs: https://support.getgrist.com/access-rules/

### 6.4 GMV formula (Python)

Cột `gmv` trong Payments, set type **Numeric** → toggle **Formula** → nhập:

```python
cutoff = AppSettings.lookupOne(key="gmv_cutoff_date").value
rate = float(AppSettings.lookupOne(key="gmv_exchange_rate").value)
cutoff_date = DATE(*[int(x) for x in cutoff.split("-")])

if $date < cutoff_date:
    return $gmv_rmb or 0
return ($real_pay_vnd or 0) / rate
```

Khi anh Hiếu/manager đổi `gmv_exchange_rate` trong bảng `AppSettings` → toàn bộ payments tự recalc.

⚠️ **Performance**: 15K rows recalc formula khi thay đổi setting. Test xem có lag không. Nếu lag → cache rate vào biến hoặc dùng trigger formula (chỉ tính khi tạo dòng mới).

### 6.5 Cảnh báo đối soát nội bộ

4 loại cảnh báo (mục 3.4 PROJECT.md):
- `DUPLICATE`: trùng `uid + date + real_pay_vnd`
- `MISSING_DATA`: thiếu sale / channel / package
- `ORPHAN_DATA`: customer_id không tồn tại trong Customers
- `RATE_DEVIATION`: GMV lệch tỷ giá > 10%

**Cách 1 — Formula column `warning`** trên Payments:

```python
warnings = []

# MISSING_DATA
if not $sale_id or not $channel_id or not $package_id:
    warnings.append("MISSING_DATA")

# DUPLICATE
dups = Payments.lookupRecords(uid=$uid, date=$date, real_pay_vnd=$real_pay_vnd)
if len(dups) > 1:
    warnings.append("DUPLICATE")

# RATE_DEVIATION
if $date >= DATE(2026, 6, 1) and $gmv_rmb and $real_pay_vnd:
    implied = $real_pay_vnd / $gmv_rmb
    rate = float(AppSettings.lookupOne(key="gmv_exchange_rate").value)
    if abs(implied - rate) / rate > 0.1:
        warnings.append("RATE_DEVIATION")

return ", ".join(warnings) if warnings else ""
```

**Cách 2 — Filter view "Đối soát"** hiện chỉ dòng có warning:
- Filter: `warning != ""`

### 6.6 Views (tab filter team + quick filter)

Trong Grist mỗi "view" = page riêng. Setup:

**Page "Doanh thu"**:
- Table widget Payments
- Filter bar: `team`, `bank_matched`, `crm_activated`, `sale_id`, `channel_id`, `package_id`, date range

**Pages riêng cho từng team** (nếu muốn tab giống app):
- Tạo Page "In-house" → filter saved `team == "In-house"`
- Tương tự "In-house 2", "Offline", "HCM"

**Page "Đối soát"**:
- Table Payments filter `warning != ""`
- Group by `warning` → đếm theo loại

**Page "Báo cáo"**:
- Chart widget: Pivot Sale × Month → sum(gmv)
- Chart widget: Bar chart Team × sum(gmv)
- Chart widget: Bar chart Channel × sum(gmv)

### 6.7 Search toàn văn

Grist có search built-in: `Ctrl+F` → search across all columns visible.

Để search server-side đa trường (uid, name, phone, sale, channel, package, payment_seq, note, team) như app hiện tại:
- Grist hỗ trợ search trong doc, tất cả cột text/reference đều được search
- Nếu cần custom: viết formula column `search_index` = concat tất cả fields → search trên cột này

### 6.8 Soft delete

Grist không có soft delete built-in, làm bằng convention:
- Column `deleted_at` (DateTime)
- Tất cả view default thêm filter `deleted_at == None`
- "Xóa" = set `deleted_at = NOW()` thay vì delete record thật
- Access Rule: chỉ system role được delete record thật

### 6.9 Audit history

Grist có **document history** built-in: top right → menu → **History** → xem từng cell ai sửa khi nào, value cũ là gì.

✅ **Điểm cộng lớn** so với app hiện tại (chỉ có `updated_at`).

### 6.10 Mobile

Grist UI web responsive — mở Chrome trên điện thoại được. Test:
- Scroll bảng payments
- Sửa 1 ô inline
- Xem chart report

⚠️ UX mobile không bằng native app. Nếu sếp/sale dùng nhiều trên mobile → đây là trade-off so với Lark (Lark có app native).

### 6.11 API integration (phase 2 — bank/CRM)

Grist có REST API: `GET/POST/PATCH /api/docs/{docId}/tables/{tableId}/records`

Auth: API key trong Profile Settings → dùng header `Authorization: Bearer <key>`

Đủ cho phase 2:
- Backend FastAPI gửi sao kê bank → Grist tạo bảng `BankTransactions`
- CRM import qua webhook → Grist tạo bảng `CrmOrders`

Docs: https://support.getgrist.com/api/

---

## 7. Acceptance checklist

Đáp ứng được tất cả mục dưới đây = POC pass, có thể trình anh Hiếu.

### 7.1 Hard gates (mục 4.1 HANDOFF_RESEARCH)

- [ ] **G1 — Row-level permission**: sale chỉ thấy dòng team mình, manager thấy team mình + read khác team, system thấy hết. Test với 4 user thật.
- [ ] **G2 — Worksheet UX cơ bản**: inline edit + paste 50 dòng từ Excel + dropdown từ master table — tất cả work.
- [ ] **G3 — Khối lượng**: 15K rows load + scroll + filter mượt. Grist self-host không có row limit, nhưng performance phải OK.
- [ ] **G4 — Formula GMV + cảnh báo trùng**: làm xong mục 6.4, 6.5. Đổi tỷ giá → recalc đúng.
- [ ] **G5 — Import + export Excel**: import 15K từ CSV/Excel. Export Page ra Excel/CSV. Test cả 2 chiều.
- [ ] **G6 — Migrate 15K + map quan hệ**: 4 bảng master link tự động với payments (mục 5.3).
- [ ] **G7 — Tái tạo bộ lọc**: tab team + quick filter "Chưa khớp NH" / "Chưa CRM" + advanced filter Sale/Kênh/Gói + date range + search đa trường + lưu được thành view cứng.

### 7.2 Worksheet UX W1-W10 (mục 3.2 HANDOFF_RESEARCH)

Test từng mục W1-W10 theo bảng mục 6.2 trên — chấm ✅/⚠️/❌, có screenshot.

### 7.3 Demo readiness

- [ ] POC chạy được local 1 lệnh `docker compose up -d`
- [ ] Folder backup `.grist` document — restore được trên máy khác
- [ ] Screen share demo qua Zoom/Meet smooth
- [ ] ngrok tunnel test với 1 user khác đăng nhập được
- [ ] Có 4 user demo: sale, manager, system, viewer — đăng nhập từng user verify scope

### 7.4 Deliverables

| # | Item | Output |
|---|---|---|
| D1 | Grist document `PalFish_Revenue_POC.grist` | File local + backup Drive |
| D2 | Folder `~/grist-poc/` setup hoàn chỉnh | docker-compose.yml + persist/ + README |
| D3 | `docs/research/GRIST_POC_RESULT.md` | Báo cáo chấm điểm theo 4.2 HANDOFF_RESEARCH |
| D4 | Screenshot 13 kịch bản POC | Folder `docs/research/screenshots/grist/` |
| D5 | Cost analysis VPS production | Bảng giá Hetzner/DO + ước lượng tháng |
| D6 | So sánh trực tiếp Lark vs Grist | Bảng trong báo cáo D3 |

---

## 8. Timeline đề xuất

| Tuần | Việc | Output |
|---|---|---|
| 15-17/06 | Setup local + import 15K + dựng schema + linked records | POC chạy được, data đầy đủ |
| 18-21/06 | Access Rules cho 4 role + test với 4 user | G1 pass |
| 22-24/06 | Formula GMV + cảnh báo + views/pages + filters | G4, G7 pass |
| 25-26/06 | Test 13 kịch bản POC + screenshot + báo cáo so sánh | Deliverables D3-D6 |
| 27/06 | Demo nội bộ với Minh — review trước khi trình anh Hiếu | Feedback round |
| Tuần 30/06 | Trình anh Hiếu (Minh sắp xếp họp) — Lark vs Grist | Quyết định cuối |

Khoảng 2 tuần làm việc. Đạt chốt lại với Minh nếu thấy không đủ.

---

## 9. Resources

### 9.1 Tài liệu Grist

- Quickstart: https://support.getgrist.com/install/docker/
- Self-managed config: https://support.getgrist.com/self-managed/
- Access Rules: https://support.getgrist.com/access-rules/
- Formulas (Python): https://support.getgrist.com/formulas/
- REST API: https://support.getgrist.com/api/
- Repo open-source: https://github.com/gristlabs/grist-core

### 9.2 Tài liệu pf-revenue

- Spec đầy đủ: `docs/PROJECT.md`
- Research nền tảng + hard gates: `docs/HANDOFF_RESEARCH_PLATFORM.md`
- Lark Base POC (baseline so sánh): Lark workspace "PalFish Revenue Manager" — hỏi Minh access

### 9.3 Liên hệ

| Hỏi gì | Hỏi ai |
|---|---|
| Spec nghiệp vụ, GMV rule, RBAC, export data Supabase | Minh |
| Flow nhập liệu thực tế, file All File gốc | Thu Hiền (ops) |
| Quyết định cuối, ưu tiên feature | Anh Hiếu (qua Minh) |
| Lark Base POC để so sánh | Minh — gửi link workspace |

### 9.4 Nguyên tắc khi build POC

1. **Backup `.grist` mỗi cuối ngày** — tránh mất công xây schema
2. **Screenshot tất cả kịch bản** — báo cáo cuối anh Hiếu cần thấy bằng chứng
3. **Test với user thật**, không chỉ owner — Access Rules dễ tưởng đúng nhưng login user khác mới phát hiện sai
4. **Đo thời gian thực tế** mọi thao tác (import, filter, paste 50 dòng) — anh Hiếu sẽ hỏi
5. **Ghi lại cái KHÔNG làm được** — báo cáo cần cả 2 chiều, không tô hồng

### 9.5 Khi gặp vướng

- Bug Grist: GitHub issues https://github.com/gristlabs/grist-core/issues
- Community: Discord Grist (link trong docs)
- Access Rules syntax phức tạp: paste expression vào Discord #help, cộng đồng phản hồi nhanh
- Vướng spec pf-revenue: hỏi Minh trên Lark

---

**Chốt lại**: POC này quyết định kiến trúc app cho 2-3 năm tới. Anh Hiếu sẽ duyệt budget dựa trên báo cáo của Đạt + Minh — đầu tư thời gian cho POC nghiêm túc là đáng.
