# Handoff: Nghiên cứu nền tảng bên ngoài cho App Quản lý Doanh Thu

> **Ngày giao**: 2026-06-12
> **Người giao**: Minh
> **Người nhận**: Đạt
> **Nguồn quyết định**: Họp với anh Hiếu tối 11/06/2026
> **Tài liệu liên quan**: `docs/PROJECT.md` (spec đầy đủ app hiện tại)

---

## 1. Bối cảnh & mục tiêu

App pf-revenue hiện tại tự code worksheet bằng AG Grid Community (bản free). Trong họp 11/06, anh Hiếu kết luận:

> Code lại từ đầu tính năng của 1 worksheet dựa vào các thư viện free/public thì sẽ **không đạt 100%** trải nghiệm. Thay vào đó, tìm hiểu **nền tảng bên ngoài** để xây app này — nền tảng phải đáp ứng được nhu cầu của app.

**Mục tiêu nghiên cứu:** Tìm, đánh giá và đề xuất **1–2 nền tảng** có thể vận hành app Quản lý Doanh thu, kèm bằng chứng POC (proof of concept) trên data thật, để anh Hiếu quyết định hướng đi.

**Không phải mục tiêu:** code thêm tính năng cho app hiện tại; so sánh thư viện JS với nhau.

**Điểm mâu thuẫn cốt lõi cần ghi nhớ khi đánh giá** — đây là kim chỉ nam của cả nghiên cứu:

- Team **rời Google Sheets** (All File) vì: không phân quyền theo dòng/team được, dễ sửa nhầm công thức, không đối soát tự động, không kiểm soát data integrity.
- Anh Hiếu **chê app tự code** vì: trải nghiệm nhập liệu không đạt 100% như Google Sheets.
- → Nền tảng được chọn phải **vừa giữ UX giống Google Sheets, vừa khắc phục được lý do bỏ Google Sheets**. Hai yêu cầu này kéo ngược chiều nhau — nghiên cứu phải chỉ rõ nền tảng nào cân bằng tốt nhất, và trade-off còn lại là gì để anh Hiếu quyết.

---

## 2. Các câu hỏi tiền đề — ✅ ĐÃ CHỐT (Minh trả lời 12/06)

| # | Câu hỏi | Trả lời | Hệ quả cho nghiên cứu |
|---|---------|---------|----------------------|
| Q1 | Ngân sách? | **Không có trần cố định** — mọi dịch vụ trả phí đều phải qua anh Hiếu duyệt | Chi phí không phải tiêu chí loại. Báo cáo phải **liệt kê đủ mọi dịch vụ + bảng giá** (kể cả nền tảng bị loại) để anh Hiếu duyệt |
| Q2 | Số user? | Max **40–50 user**, trong đó **~10 editor** (hiện tại 5–7). User chính: phòng kế toán + ops (Thu Hiền), leader/manager, sếp cấp cao (Josh, anh Hiếu) | Tính giá theo kịch bản **10 editor + 40 viewer × 12 tháng**. Sếp chủ yếu xem báo cáo → trải nghiệm viewer/share dashboard read-only cũng phải test |
| Q3+Q4 | Kiểm soát data / giữ Supabase? | **Công ty kiểm soát được database/data (như đang kiểm soát Supabase) là điểm cộng lớn**; không bắt buộc giữ Supabase | Ưu tiên nền tảng self-host hoặc chạy trên Postgres của mình (Teable/NocoDB đấu thẳng Supabase là lợi thế riêng). SaaS đóng (Airtable/Lark) phải chứng minh export/backup/API đầy đủ |
| Q5 | "100% worksheet" là gì? | Anh Hiếu định nghĩa **theo nghĩa đen** — checklist cụ thể ở mục 3.2 | Checklist 3.2 = acceptance criteria chính khi POC (kịch bản 3, mục 6). Danh sách mở — phát sinh thêm thì bổ sung vào 3.2 |

**Định hướng đã chốt:** thiên về **Hướng A** (mục 5), với 4 điều kiện bắt buộc đi kèm: (1) kiểm soát được data, (2) phân quyền hiệu quả theo role + phòng ban, (3) migrate được 15K dòng từ sheet, (4) tái tạo được logic lọc của app hiện tại.

---

## 3. Nhu cầu app — những gì nền tảng PHẢI đáp ứng

Tóm tắt từ `docs/PROJECT.md`. Đây là spec nghiệp vụ, không phụ thuộc tech stack.

### 3.1 Dữ liệu & khối lượng

| Bảng | Số dòng hiện tại | Ghi chú |
|---|---|---|
| payments (doanh thu) | ~15.000 | Bảng chính, tăng liên tục — tính cho **50–100K dòng trong 2–3 năm** |
| customers | ~10.000 | UID là khóa |
| sales | ~200 | Nhân viên, có team + khối |
| channels | ~34 | Kênh bán |
| packages | ~153 | Gói học |
| bank_transactions / crm_orders | chưa có data | Phase 2 — đối soát ngân hàng & CRM |

Bảng payments 14 cột: Ngày, UID, Khách, Sale, Team, Kênh, Gói, VNĐ, GMV, Lần TT, Trạng thái, NH (khớp ngân hàng), CRM (kích hoạt), Note. Quan hệ: payment → customer/sale/channel/package (dropdown từ bảng master).

### 3.2 UX nhập liệu — checklist "100% worksheet" (anh Hiếu chốt 12/06)

Đây là **acceptance criteria chính** của cả nghiên cứu. Khi POC, chấm pass/fail từng mục:

| # | Thao tác | Ghi chú khi test |
|---|---|---|
| W1 | Thêm 1 dòng / **nhiều dòng cùng lúc** | Thêm 10 dòng trống một lượt |
| W2 | Nhập data inline | Click ô là gõ được ngay, không qua form/drawer |
| W3 | **Bộ lọc cứng** (lưu lại, dùng lại được) + **bộ lọc tạm thời** (ad-hoc, tắt là mất) | Tương đương filter view vs quick filter của Google Sheets |
| W4 | Xóa 1 dòng / **nhiều dòng cùng lúc** | Chọn 10 dòng → xóa một lượt |
| W5 | **Chọn nhiều dòng cùng lúc để edit hàng loạt** | Ví dụ: chọn 10 dòng → đổi Sale/Team cho cả 10 |
| W6 | **Quy định định dạng/cấu trúc data theo cột** | Data validation: cột ngày chỉ nhận ngày, cột tiền chỉ nhận số, cột Sale chỉ nhận giá trị trong danh mục |
| W7 | Copy/paste vùng nhiều ô từ Excel; undo/redo | Paste block 50 dòng × 5 cột |
| W8 | Dropdown chọn Sale / Kênh / Gói từ danh mục; calendar picker cho cột ngày | |
| W9 | Freeze 4 cột đầu (Ngày, UID, Khách, Sale); bảng fit 1 màn hình, không scroll body | |
| W10 | Right-click menu; auto-save khi sửa xong; không icon mơ hồ | |

Danh sách mở (anh Hiếu để "v.v.") — phát sinh thêm yêu cầu thì thêm W11, W12… vào đây.

### 3.3 Phân quyền (lý do chính bỏ Google Sheets — bắt buộc)

- 4 role: sale (1) < leader (2) < manager (3) < system (4)
- 4 phòng ban: Bán hàng, Nhân sự, Marketing, CS — ma trận phòng ban × module với 3 mức: full / read / none, có override theo từng email
- **Phạm vi dữ liệu theo dòng (row-level)**: system thấy tất cả; manager thấy team mình; leader/sale chỉ thấy team + khối của mình. Đây là yêu cầu khó nhất với các nền tảng — kiểm tra kỹ nhất ở mục này
- Khóa/ẩn cột với role thấp (ví dụ sale không sửa được cột GMV)

### 3.4 Logic nghiệp vụ

- **GMV**: trước cutoff 01/06/2026 lấy `gmv_rmb`; từ cutoff trở đi tính `real_pay_vnd / tỷ_giá` (mặc định 3700, **manager/system chỉnh được** tỷ giá + cutoff trong UI, lưu settings)
- **Summary**: tổng GMV, tổng VNĐ, số đơn, số chưa khớp NH, số chưa kích hoạt CRM — tính server-side theo filter đang chọn
- **Cảnh báo đối soát nội bộ** (4 loại): DUPLICATE (trùng uid + ngày + số tiền), MISSING_DATA, ORPHAN_DATA, RATE_DEVIATION (lệch tỷ giá quá ngưỡng)
- Refund flow (đánh dấu hoàn tiền / khôi phục), soft delete, chỉ tính báo cáo trên đơn `active`
- **Phase 2**: upload sao kê ngân hàng → match với payments; import đơn CRM hàng loạt → auto-match

### 3.5 Báo cáo & xuất file

- BCTB: pivot Sale × Ngày → GMV
- Tổng hợp theo Team, theo Kênh (GMV / VNĐ / số đơn)
- Lọc theo khoảng ngày; **export Excel** cho cả data lẫn báo cáo; **import từ Excel/CSV**

### 3.6 Bộ lọc — phải tái tạo đủ logic lọc của app hiện tại (bắt buộc, chốt 12/06)

- Tab lọc theo team: Tất cả | In-house | In-house 2 | Offline | HCM
- Quick filter 1 chạm: "Chưa khớp NH" (bank_matched = false), "Chưa CRM" (crm_activated = false)
- Filter nâng cao kết hợp được với nhau: dropdown Sale / Kênh / Gói + khoảng ngày
- Search toàn văn: uid, tên khách, SĐT, sale, kênh, gói, payment_seq, note, team
- Luôn ẩn dòng xóa mềm (deleted_at); phân biệt trạng thái active/refunded

### 3.7 Khác

- ~40–50 user, ~10 editor (kế toán + ops); sếp (Josh, anh Hiếu) chủ yếu **xem** → cần share báo cáo/view read-only gọn gàng
- Đăng nhập email/password, kích hoạt/khóa tài khoản
- Dùng được trên mobile (xem + sửa nhanh)
- Tiếng Việt (data có dấu; UI tiếng Việt là điểm cộng — có sếp nước ngoài nên UI tiếng Anh cũng phải ổn)
- Audit: biết ai sửa gì, khi nào (app hiện tại mới có created_at/updated_at — nền tảng nào có revision history per cell là điểm cộng lớn)

---

## 4. Tiêu chí đánh giá & trọng số

### 4.1 Tiêu chí LOẠI TRỰC TIẾP (hard gate — fail 1 cái là loại)

1. **Row-level permission**: giới hạn được sale chỉ thấy dòng của team/khối mình; phân quyền theo role + phòng ban hoạt động thật
2. **Worksheet UX cơ bản**: inline edit + paste nhiều ô từ Excel + dropdown từ bảng master
3. **Khối lượng**: chịu được ≥ 50.000 dòng/bảng mà không nghẽn hoặc vượt limit của gói
4. **Formula/automation** đủ sức viết rule GMV (điều kiện theo ngày + tham số tỷ giá) và rule cảnh báo trùng
5. **Import + export Excel**
6. **Migrate được 15K dòng từ sheet hiện tại**, map đúng quan hệ sang bảng master (sale/kênh/gói/khách)
7. **Tái tạo được bộ lọc của app hiện tại** (danh sách ở mục 3.6)

> Lưu ý: chi phí KHÔNG phải tiêu chí loại (Q1 — không có trần ngân sách). Nhiệm vụ là liệt kê đủ và chính xác giá của mọi dịch vụ để anh Hiếu duyệt.

### 4.2 Tiêu chí chấm điểm (cho các nền tảng qua được gate)

| Tiêu chí | Trọng số | Cách đo |
|---|---|---|
| UX worksheet giống Google Sheets | 25% | Checklist W1–W10 mục 3.2 (anh Hiếu chốt) — chấm từng thao tác |
| Phân quyền (row/column/module + override, theo role & phòng ban) | 20% | Dựng đủ role thật (sale/manager/system + viewer sếp), nghiệm thu từng scope |
| Logic nghiệp vụ & automation | 15% | Làm được GMV rule + 2/4 loại cảnh báo |
| Kiểm soát data & lock-in | 10% | Self-host hoặc chạy trên Postgres của mình? Export toàn bộ + backup tự động? Audit history? (Q3: kiểm soát được như Supabase = điểm cộng lớn) |
| Báo cáo (pivot, aggregate) + export | 10% | Dựng được BCTB + báo cáo Team/Kênh; share read-only cho sếp |
| Hiệu năng + migrate 15K dòng thật | 10% | Đo thời gian import, load, scroll, filter |
| Chi phí 12 tháng | 5% | Bảng giá đầy đủ mọi gói; kịch bản 10 editor + 40 viewer × 12 tháng (Q2) |
| API & tích hợp, tiếng Việt, mobile | 5% | Đọc/ghi record qua API (cần cho bank/CRM phase 2); UI Việt/Anh; dùng trên điện thoại |

---

## 5. Ba hướng tiếp cận & danh sách nền tảng gợi ý

Nghiên cứu theo 3 hướng, mỗi hướng trả lời một câu hỏi khác nhau. Pricing/limit thay đổi liên tục — **tự kiểm tra trang pricing tại thời điểm nghiên cứu**, đừng tin số trong tài liệu cũ.

### Hướng A — Nền tảng all-in-one (thay cả DB + UI + phân quyền)

Câu hỏi: *bỏ hẳn app tự code, chuyển toàn bộ sang nền tảng spreadsheet-database?*

**→ Minh xác nhận (12/06) đây là hướng thiên về**, kèm 4 điều kiện bắt buộc: kiểm soát được data, phân quyền theo role + phòng ban, migrate 15K dòng từ sheet, tái tạo logic lọc hiện có.

| Nền tảng | Vì sao đáng xem | Điểm phải kiểm tra kỹ |
|---|---|---|
| **Airtable** | Chuẩn mực của thể loại, automation + interface mạnh, phổ biến | Giới hạn records/base theo gói; row-level permission chỉ có ở gói cao; giá per-editor đắt; server US — phải chứng minh export/backup tự động được (Q3) |
| **Lark Base** (Larksuite) | Phân quyền theo dòng tốt, có tiếng Việt, rẻ, kèm luôn chat/approval; nhiều công ty VN đang dùng | Giới hạn dòng/base; formula có đủ mạnh cho GMV rule; pivot báo cáo; data trên server ByteDance — phải chứng minh export/backup tự động được (Q3) |
| **SeaTable** | Chịu tải lớn (hàng trăm K dòng), script Python/JS, self-host được | UX kém mượt hơn Airtable; cộng đồng nhỏ |
| **Grist** | Open-source, **access rules dạng công thức → row-level permission mạnh nhất nhóm**, formula Python, self-host miễn phí | UI kém bóng bẩy; tự vận hành server; ít người dùng ở VN |
| **Teable / NocoDB / Baserow** | Open-source Airtable-clone, chạy trên Postgres (NocoDB/Teable có thể **đấu thẳng vào Supabase hiện tại** — đúng mong muốn kiểm soát data ở Q3) | Độ chín của row-level permission; sản phẩm còn trẻ, nhiều bug |
| **Smartsheet** | Thuần spreadsheet UX nhất trong nhóm enterprise | Phân quyền theo dòng yếu (chia sheet là chính); giá enterprise |

### Hướng B — Giữ Supabase + backend, thay tầng UI bằng low-code builder

Câu hỏi: *giữ toàn bộ data + logic đã xây (Supabase, FastAPI, RPC), chỉ thay phần FE grid tự code bằng nền tảng dựng UI?*

| Nền tảng | Ghi chú |
|---|---|
| **Retool** | Table component editable mạnh nhất nhóm, connect Postgres/Supabase trực tiếp, permission groups; giá per-user |
| **Appsmith** | Open-source, self-host miễn phí |
| **Budibase** | Open-source, dựng nhanh, row-level qua filter |
| **ToolJet** | Tương tự Appsmith |

⚠️ **Lưu ý trung thực với hướng này**: grid của Retool/Appsmith bản chất cũng là component như AG Grid — **có nguy cơ lặp lại đúng vấn đề anh Hiếu chê** (không đạt 100% UX spreadsheet). Đánh giá nhanh thôi (1 buổi), chỉ đào sâu nếu Hướng A fail về phân quyền hoặc data.

### Hướng C — Chính Google Sheets làm UI + đồng bộ về DB (baseline)

Câu hỏi: *nếu "100% như Google Sheets" là yêu cầu cứng, thì chính Google Sheets + Apps Script + protected ranges + sync về Supabase có sống được không?*

- UX đạt 100% theo định nghĩa (vì chính là Google Sheets), báo cáo/đối soát chạy phía Supabase
- Yếu chí mạng: phân quyền theo dòng gần như không có (workaround: tách file/tab theo team — đúng cái đau ngày xưa), data integrity, quota Apps Script
- **Vẫn phải đánh giá nghiêm túc** để: (1) có baseline so sánh, (2) chứng minh với anh Hiếu là đã cân nhắc, kèm số liệu vì sao đạt/không đạt

### Khuyến nghị phân bổ thời gian (cập nhật theo trả lời 12/06)

Hướng A là trọng tâm (~80%). Vì tiêu chí "công ty kiểm soát được data" (Q3), POC nên gồm **cả 2 nhóm để so trực tiếp**:

- 1 nền tảng SaaS hoàn thiện nhất về UX + phân quyền: **Lark Base** hoặc **Airtable**
- 1–2 nền tảng kiểm soát được data: **Teable/NocoDB đấu vào Supabase** (giữ nguyên database hiện tại) hoặc **Grist/SeaTable self-host**

Báo cáo cuối phải cho anh Hiếu thấy rõ trade-off giữa 2 nhóm: *"mượt + không tốn công vận hành nhưng data nằm ở vendor"* vs *"kiểm soát data trọn vẹn nhưng tự vận hành server + UX kém bóng bẩy hơn"*.

Hướng C ~15% (làm rõ baseline). Hướng B ~5% (khảo sát giấy — giữ làm phương án dự phòng "kiểm soát data tuyệt đối" nếu cả nhóm A fail phân quyền).

---

## 6. Kịch bản POC — test gì trên mỗi nền tảng lọt vòng 2

Xin Minh file Excel export từ app (toàn bộ ~15K dòng + bảng master). Mỗi kịch bản chấm: ✅ đạt / ⚠️ đạt một phần (ghi rõ) / ❌ không đạt. Kịch bản 1, 3, 4, 5, 6 đụng trực tiếp hard gates (mục 4.1) — fail là dừng nền tảng đó.

1. **Migrate 15K dòng** từ Excel/sheet (kèm 4 bảng master) — đo thời gian; có vượt limit gói không; tiếng Việt có dấu; **text "tên sale/kênh/gói" có map tự động thành linked record không hay phải làm tay**
2. **Dựng bảng payments 14 cột**: 4 cột đầu freeze; Sale/Kênh/Gói là dropdown link tới bảng master; cột Ngày có calendar picker
3. **Checklist "100% worksheet"** (mục 3.2): chấm riêng từng mục W1–W10 — đặc biệt chú ý W3 (bộ lọc cứng/tạm thời), W5 (bulk edit nhiều dòng đã chọn), W6 (data validation theo cột)
4. **Tái tạo bộ lọc app hiện tại** (mục 3.6): tab team, quick filter Chưa khớp NH / Chưa CRM, filter Sale/Kênh/Gói + khoảng ngày, search đa trường — và **lưu được thành filter view cứng**
5. **GMV formula**: nếu ngày < 01/06/2026 → lấy gmv_rmb, ngược lại → VNĐ / tỷ giá đọc từ bảng settings. Đổi tỷ giá → toàn bộ recalc đúng
6. **Phân quyền**: tạo 4 user thật (sale team In-house, manager In-house, system, viewer sếp) → đăng nhập từng user kiểm tra: sale chỉ thấy dòng team mình, không sửa được cột GMV; user phòng Marketing không thấy module doanh thu; viewer xem được báo cáo nhưng không sửa được gì
7. **Báo cáo**: pivot Sale × Ngày (GMV), tổng theo Team / Kênh, lọc theo khoảng ngày, export Excel; share link báo cáo read-only cho sếp
8. **Cảnh báo trùng**: rule báo dòng trùng uid + ngày + số tiền (automation/script/view đều chấp nhận); thử thêm rule thiếu data
9. **Đồng thời**: 2–3 người cùng sửa 1 bảng — có realtime không, có ghi đè mất data không
10. **Audit**: xem lịch sử sửa của 1 ô/dòng — ai, lúc nào, giá trị cũ
11. **API & backup**: tạo + đọc 1 record qua REST API (chuẩn bị cho đối soát bank/CRM phase 2); **có backup tự động / export định kỳ không** (Q3 — kiểm soát data)
12. **Mobile**: mở trên điện thoại, sửa thử 1 ô
13. **Thoát hiểm (lock-in)**: export toàn bộ base ra Excel/CSV — có mất quan hệ/format không; nếu self-host: ước lượng công vận hành server

---

## 7. Deliverables & timeline đề xuất

| Bước | Việc | Output | Thời gian đề xuất |
|---|---|---|---|
| 0 | ~~Chốt 5 câu hỏi mục 2~~ | ✅ Minh trả lời 12/06 — đã ghi vào mục 2 | Xong |
| 1 | Khảo sát rộng (long list ~8–10 nền tảng) qua docs + pricing, lọc bằng hard gates (4.1) | Bảng long list + lý do loại từng cái + **bảng giá đầy đủ MỌI nền tảng khảo sát** (Q1: anh Hiếu duyệt chi phí nên cần đủ hết, kể cả cái bị loại) | 13–16/06 |
| 2 | POC sâu 2–3 nền tảng lọt vòng (1 SaaS + 1–2 self-host/Supabase-based), chạy 13 kịch bản mục 6 trên data thật | Workspace demo từng nền tảng + bảng chấm điểm theo 4.2 | 16–18/06 |
| 3 | Viết báo cáo đề xuất | 1–2 trang: top 1–2 nền tảng, điểm số, chi phí 12 tháng (10 editor + 40 viewer), trade-off còn lại, link demo | 19/06 |
| 4 | Trình anh Hiếu (Minh sắp xếp họp) | Quyết định hướng đi | tuần 22/06 |

Kết quả lưu tại: `docs/research/PLATFORM_COMPARISON.md` (bảng so sánh + điểm) và `docs/research/PLATFORM_RECOMMENDATION.md` (báo cáo đề xuất). Timeline chỉ là đề xuất — Đạt chốt lại với Minh sau khi xem khối lượng.

**Mẫu bảng so sánh:**

| Tiêu chí (trọng số) | Lark Base | Airtable | Teable (trên Supabase) | Grist/SeaTable | Google Sheets (baseline) |
|---|---|---|---|---|---|
| UX worksheet W1–W10 (25%) | | | | | |
| Phân quyền (20%) | | | | | |
| Logic & automation (15%) | | | | | |
| Kiểm soát data & lock-in (10%) | | | | | |
| Báo cáo + export (10%) | | | | | |
| Hiệu năng + migrate 15K dòng (10%) | | | | | |
| Chi phí/năm — 10 editor + 40 viewer (5%) | | | | | |
| API, tiếng Việt, mobile (5%) | | | | | |
| **Tổng** | | | | | |
| Hard gate fail? | | | | | |

---

## 8. Tài nguyên & liên hệ

- **Spec đầy đủ app hiện tại**: `docs/PROJECT.md` (đọc trước khi bắt đầu — đặc biệt mục 2 Design Spec và 3.3 Database Schema)
- **App đang chạy**: FE trên Vercel, BE trên Render — hỏi Minh link + tài khoản test để trải nghiệm app hiện tại trước (cần biết "đối thủ" mình đang so sánh)
- **Data mẫu**: hỏi Minh export Excel từ app (`GET /api/v1/payments/export`) hoặc file All File gốc
- **Hỏi nghiệp vụ** (GMV rule, recon, phân quyền): Minh
- **Hỏi flow nhập liệu thực tế / file All File gốc**: Thu Hiền (ops — editor chính tương lai, nên mời tham gia nghiệm thu UX khi POC)
- **Hỏi yêu cầu UX / quyết định cuối**: anh Hiếu (qua Minh)

### Nguyên tắc khi nghiên cứu

1. **Bằng chứng > cảm nhận**: mọi ô trong bảng chấm điểm phải kèm screenshot hoặc link demo, không chấm theo marketing page
2. **Pricing tính theo kịch bản thật**: 10 editor + 40 viewer (Q2), tính cho 12 tháng, gồm cả gói phải nâng cấp vì limit dòng; liệt kê đủ MỌI dịch vụ có phí — kể cả nền tảng bị loại — để anh Hiếu duyệt (Q1)
3. **Fail sớm**: dính hard gate là dừng, không POC tiếp cho đỡ tốn thời gian — ghi lý do loại rồi chuyển nền tảng khác
4. **Ghi lại cả cái KHÔNG đạt**: báo cáo cuối cần mục "những gì nền tảng X không làm được so với app hiện tại" — anh Hiếu cần thấy trade-off hai chiều
