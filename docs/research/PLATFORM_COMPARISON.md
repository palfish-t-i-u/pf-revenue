# Báo cáo Khảo sát & So sánh các Nền tảng Quản lý Doanh thu
> **Dự án**: pf-revenue — App Quản lý Doanh thu (PalFish)
> **Tác giả**: Đạt 
> **Ngày thực hiện**: 12/06/2026
> **Bối cảnh**: Khảo sát và đánh giá sơ bộ các giải pháp phần mềm/nền tảng bên ngoài để thay thế hoặc bổ trợ cho ứng dụng tự phát triển (`pf-revenue`). Mục tiêu là tìm kiếm một công cụ có thể giữ nguyên trải nghiệm nhập liệu (Worksheet UX) tiện lợi như Google Sheets nhưng giải quyết triệt để vấn đề về phân quyền dòng/cột (RLS), tính toàn vẹn dữ liệu (Data Integrity) và khả năng mở rộng.
> 
> *Lưu ý: Báo cáo này đại diện cho bước đánh giá sơ bộ (Preliminary Assessment) dựa trên tài liệu kỹ thuật chính thức của sản phẩm, phản hồi cộng đồng (community feedback) và năng lực của từng nền tảng. Cần chạy thử nghiệm thực tế (POC) với dữ liệu thật ở bước tiếp theo để xác nhận và chấm điểm cuối cùng.*

---

## 1. Định nghĩa 7 Tiêu chí Loại trực tiếp (Hard Gates)
Để đảm bảo nền tảng được chọn đáp ứng tối thiểu nhu cầu nghiệp vụ mà không cần tùy biến phức tạp, chúng tôi lọc danh sách 13 ứng cử viên thông qua 7 cổng kỹ thuật sau:

1. **Row-Level Permission (Phân quyền theo dòng - RLS)**: Giới hạn phạm vi xem/sửa dữ liệu theo dòng: System thấy tất cả; Manager thấy team mình; Leader/Sale thấy team + khối của mình. Hỗ trợ ẩn/khóa các cột dữ liệu nhạy cảm (như GMV) đối với các role thấp.
2. **Worksheet UX cơ bản**: Phải có trải nghiệm nhập liệu nhanh, click-and-type inline, copy/paste vùng nhiều ô trực tiếp từ Excel, hỗ trợ dropdown/calendar picker nhanh, bulk edit nhiều dòng cùng lúc.
3. **Khối lượng (Capacity)**: Chịu tải tối thiểu **50.000 - 100.000 dòng** trong 2-3 năm tới mà không bị đơ giật UI và không vượt quá giới hạn cứng của các gói dịch vụ thông thường.
4. **Formula & Automation**: Đủ khả năng viết công thức GMV động (lọc theo mốc thời gian và tham số tỷ giá động từ bảng settings) và tự động phát hiện trùng lặp dữ liệu (duplicate alerts).
5. **Import & Export Excel**: Nhập/xuất file mượt mà, giữ nguyên định dạng, không lỗi font Tiếng Việt.
6. **Migrate 15K dòng**: Khả năng import trơn tru 15.000 dòng dữ liệu hiện tại kèm theo các bảng danh mục master (Sale, Kênh, Gói, Khách). Đặc biệt, hệ thống cần hỗ trợ tự động map quan hệ các trường danh mục từ dạng văn bản thô thành linked record (hoặc có công cụ hỗ trợ map tự động) để tránh cấu hình thủ công từng dòng.
7. **Tái tạo bộ lọc của App hiện tại**: Lọc theo tab Team (Tất cả | In-house | In-house 2 | Offline | HCM), Quick filter 1 chạm (Chưa khớp NH, Chưa CRM), kết hợp nhiều bộ lọc nâng cao (khoảng ngày, dropdown Sale/Kênh/Gói) và Search toàn văn (full-text search).

---

## 2. Bảng Đánh giá Sơ bộ 13 Nền tảng (Hard Gate Screening)

| Nhóm | Nền tảng | Gate 1 (RLS) | Gate 2 (UX) | Gate 3 (Cap) | Gate 4 (Form) | Gate 5 (IO) | Gate 6 (Mig) | Gate 7 (Filt) | Kết quả sơ bộ | Lý do loại chính / Ghi chú |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **SaaS / All-in-One** | **Lark Base** | ✅ Pass | ✅ Pass | ⚠️ Warn | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **ĐI TIẾP (Top SaaS)** | Phân quyền dòng trực quan ở cấp Base; UX bảng mượt. ⚠️ Gate 3: limit records/table theo tài liệu là 20K–50K tùy plan — POC phải xác minh plan nào đủ 50K–100K. Mức độ tự động map linked records khi migrate cũng cần xác minh bằng POC thực tế. |
| | **Airtable** | ⚠️ Warn | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **LOẠI (Hoặc Enterprise)** | Có Interface permissions, Record visibility, Enterprise controls nhưng không mạnh bằng Grist/Teable ở cấp DB. Các gói thông thường không hỗ trợ DB-level RLS thực thụ (chỉ giới hạn ở UI). Gói Enterprise hỗ trợ đầy đủ nhưng chi phí rất đắt đỏ. |
| | **Grist** | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **ĐI TIẾP (Top Self-host)** | Phân quyền bằng công thức Python cực mạnh và linh hoạt ở cấp DB. Trực quan hóa dữ liệu tốt. Hoàn toàn miễn phí khi tự host. |
| | **SeaTable** | ⚠️ Warn | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **KHÔNG ƯU TIÊN** | Không ưu tiên / loại khỏi POC vòng 1 do tỷ lệ cost-value thấp (bản Developer giới hạn 3 user, bản Enterprise self-host cho 50 users có phí rất cao ~199 triệu VNĐ/năm). |
| | **Smartsheet** | ❌ Fail | ✅ Pass | ❌ Fail | ✅ Pass | ✅ Pass | ⚠️ Warn | ⚠️ Warn | **LOẠI** | Giới hạn cứng 20.000 dòng/sheet (fail Gate 3). Phân quyền dòng yếu (phải chia nhỏ sheet). |
| | **Google Sheets (Baseline)** | ❌ Fail | ✅ Pass | ⚠️ Warn | ✅ Pass | ✅ Pass | ❌ Fail | ❌ Fail | **LOẠI (Baseline)** | Không có DB-level RLS thực thụ (dễ bị xem trộm/sửa đè công thức). Hiệu năng giảm sâu khi đạt 50k+ dòng nhưng không vượt giới hạn cứng của file. Không tự động map linked records khi migrate. |
| **Supabase / Postgres** | **Teable** | ⚠️ Pass (Tạm thời) | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **ĐI TIẾP (Postgres-based)** | Giao diện Airtable-clone chạy trên Postgres cực nhanh. Cần POC xác minh tính năng Authority Matrix (RLS) có sẵn miễn phí trên bản self-hosted/community hay không. Cảnh báo nguy cơ xung đột schema khi đấu vào database Supabase hiện tại. |
| | **NocoDB** | ⚠️ Conditional | ⚠️ Warn | ✅ Pass | ⚠️ Warn | ✅ Pass | ⚠️ Warn | ✅ Pass | **CẦN POC / ENTERPRISE** | Tính năng RLS/Access Control nâng cao yêu cầu bản đóng phí Enterprise. UX bảng nhập liệu và mức độ đáp ứng cần POC thực tế để kiểm chứng. |
| | **Baserow** | ⚠️ Pass (Premium) | ✅ Pass | ⚠️ Warn | ✅ Pass | ✅ Pass | ✅ Pass | ✅ Pass | **ĐI TIẾP (Backup)** | Phân quyền nâng cao và RLS yêu cầu gói Premium ($10/user/tháng) kể cả khi self-host. Giới hạn 50K dòng/workspace. Cần xác minh license Advanced/Enterprise nếu muốn 100K dòng hoặc phân quyền sâu hơn. |
| **Low-Code UI Builders** | **Retool** | ✅ Pass | ❌ Fail | ✅ Pass | ✅ Pass | ✅ Pass | ⚠️ Warn | ✅ Pass | **LOẠI** | Grid component thô sơ, không đạt 100% trải nghiệm worksheet UX (thiếu copy-paste khối ô, kéo chuột điền dữ liệu, double-click inline nhanh). |
| | **Appsmith** | ✅ Pass | ❌ Fail | ✅ Pass | ✅ Pass | ✅ Pass | ❌ Fail | ✅ Pass | **LOẠI** | Tương tự Retool, grid không đạt chuẩn worksheet UX (chỉ là table widget thô). |
| | **Budibase** | ✅ Pass | ❌ Fail | ✅ Pass | ✅ Pass | ✅ Pass | ❌ Fail | ✅ Pass | **LOẠI** | Tương tự Retool. |
| | **ToolJet** | ✅ Pass | ❌ Fail | ✅ Pass | ✅ Pass | ✅ Pass | ❌ Fail | ✅ Pass | **LOẠI** | Tương tự Retool. |

---

## 3. Bảng Giá & Hạn Mức 13 Nền Tảng (12 Tháng)
Kịch bản tính toán: **10 Editors (nhập liệu, kế toán, ops) + 40 Viewers (sếp, manager đọc báo cáo) hoạt động trong 12 tháng**. Cơ sở dữ liệu hiện tại **15.000 dòng** và tăng trưởng lên **50.000 - 100.000 dòng** trong 2-3 năm.
*Tỷ giá áp dụng:* **26,408 VNĐ/USD**.

### 3.1 Bảng Tổng Hợp Chi Phí 13 Nền Tảng

| Nền tảng | Gói dịch vụ đề xuất | Cách tính phí (Seat Model) | Chi phí Cloud / Năm ($ hoặc €) | Chi phí Cloud / Năm (VNĐ) | Chi phí Self-host / Năm (VNĐ) | Giới hạn bản ghi (Records Limit) |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **Lark Base** | Pro Plan | Tính trên member (Viewer Guest miễn phí) | $960 - $1,152 (10 seats Pro)<br>hoặc $4,800 - $5,760 (50 seats) | **25.351.680 - 30.422.016 VNĐ**<br>hoặc **126.758.400 - 152.109.056 VNĐ** | N/A (Chỉ chạy Cloud SaaS) | Giới hạn phụ thuộc plan/add-on<br>(20K hàng/bảng gói Pro,<br>cần AE để expand) |
| **Airtable** | Business Plan | Tính trên editor (Viewer Interfaces miễn phí) | $5,400 (10 editors) | **142,603,200 VNĐ** | N/A (Chỉ chạy Cloud SaaS) | 125.000 dòng/base |
| **Grist** | Pro / Self-host | Tính trên member / Self-host free | $4,800 (50 seats Pro)<br>(Bản Pro giới hạn 2 guests) | **126,758,400 VNĐ** | **6.073.840 - 33.010.000 VNĐ**<br>(Chỉ tốn phí VPS hạ tầng) | 100.000 dòng/doc (Cloud)<br>Self-host không giới hạn |
| **Teable** | Business / Community | Tính trên member / Self-host free | $12,000 (50 seats Business) | **316,896,000 VNĐ** | **Cần mua bản Enterprise (EE)**<br>để có Authority Matrix | 1.000.000 dòng/space (Business)<br>Self-host không giới hạn |
| **SeaTable** | Enterprise | Tính trên member (Cloud & Self-host) | €8,400 (50 seats Enterprise) | **238,200,000 VNĐ**<br>(Tỷ giá EUR/VND ~28.360) | **~199,644,480 VNĐ**<br>(€7,000/năm Enterprise) | Không giới hạn dòng (Enterprise)<br>Self-host tùy chỉnh |
| **Baserow** | Premium Plan | Tính trên member | $6,000 (50 seats) | **158,448,000 VNĐ** | **158,448,000 VNĐ**<br>+ Phí VPS hạ tầng | 50.000 dòng/workspace (Cloud)<br>Self-host tùy chỉnh |
| **Smartsheet** | Business Plan | Tính trên editor | $3,000 (10 editors) | **79,224,000 VNĐ** | N/A (Chỉ chạy Cloud SaaS) | **20.000 dòng/sheet** (Không đạt) |
| **Google Sheets**| Workspace Starter | Tính trên member (hoặc Free cá nhân) | $3,600 (50 users) | **95,068,800 VNĐ** | N/A (Chỉ chạy Cloud SaaS) | **10.000.000 cells** (Hiệu năng giảm sâu khi chạy công thức nặng) |
| **NocoDB** | Enterprise / Community | Tính trên member / Self-host free (no RLS) | Liên hệ trực tiếp | Thỏa thuận Enterprise | **Cần mua bản Enterprise**<br>để dùng RLS/Access Control |
| **Retool** | Team Plan | Tính trên Editors ($10) + Viewers ($5) | $3,600 (10 Std + 40 Lgt) | **95,068,800 VNĐ** | Thỏa thuận Enterprise | Tùy thuộc DB kết nối (Postgres) |
| **Appsmith** | Business Plan | Tính trên giờ active ($0.40/h, max $20/m) | Tối đa $12,000 (50 users) | Tối đa **316,896,000 VNĐ** | Tối đa **316,896,000 VNĐ**<br>+ Phí VPS hạ tầng | Tùy thuộc DB kết nối (Postgres) |
| **Budibase** | Premium Plan | Tính trên member | $3,000 (50 users) | **79,224,000 VNĐ** | **79,224,000 VNĐ**<br>+ Phí VPS hạ tầng | Tùy thuộc DB kết nối |
| **ToolJet** | Basic Plan | Tính trên member | $9,000 (50 users) | **237,672,000 VNĐ** | Thỏa thuận Enterprise | Tùy thuộc DB kết nối |

---

### 3.2 Phân Tích Chi Tiết Các Phương Án Trọng Điểm

#### A. Lark Base (Pro Plan)
*   **Giá niêm yết**: **$8.00 - $9.60 / user / tháng** (Thanh toán theo năm, tùy thuộc vào ưu đãi/vùng đăng ký).
*   **Cách tính seat**: Lark tính tiền trên tất cả thành viên trong tổ chức (Organization member). Tuy nhiên, đối với viewer bên ngoài hoặc tài khoản Guest (chỉ xem và comment), Lark cho phép chia sẻ miễn phí không giới hạn.
    *   *Phương án 1 (Tối ưu - Guest Link)*: Trả phí Pro cho 10 Editors. 40 Viewers chia sẻ dạng Guest Link hoặc External Collaborator (Read-only).
        *   *Chi phí*: 10 seats × ($8.00 - $9.60) × 12 tháng = **$960 - $1,152 / năm** (~ **25.351.680 - 30.422.016 VNĐ**).
    *   *Phương án 2 (Đầy đủ - Member)*: Cấp tài khoản nội bộ cho toàn bộ 50 user để quản lý tập trung và chat nội bộ.
        *   *Chi phí*: 50 seats × ($8.00 - $9.60) × 12 tháng = **$4,800 - $5,760 / năm** (~ **126.758.400 - 152.109.056 VNĐ**).
*   **Giới hạn**: Giới hạn record của Lark Base phụ thuộc plan/add-on; gói Pro mặc định là **20.000 hàng/bảng** (20K records/table), muốn mở rộng cần liên hệ với sales/Account Executive để mua thêm add-on mở rộng lên tối đa 2.000.000 dòng.


#### B. Airtable (Business Plan)
*   **Giá niêm yết**: $45 / editor / tháng (Gói Team giá $20 nhưng không hỗ trợ RLS và giới hạn 50k dòng/base). Để cấu hình RLS qua Interfaces và nâng hạn mức lên 125k dòng, bắt buộc dùng gói Business.
*   **Cách tính seat**: Chỉ tính phí Editor. Viewers (Read-only) trong Interfaces được miễn phí hoàn toàn.
*   **Chi phí**: 10 editors × $45 × 12 tháng = **$5,400 / năm** (~ 142,603,200 VNĐ). 40 Viewers miễn phí.
*   **Giới hạn**: 125.000 bản ghi/base ở gói Business.

#### C. Grist (Pro Plan - Cloud)
*   **Giá niêm yết**: $8 / user / tháng.
*   **Cách tính seat**: Grist tính tiền trên mỗi thành viên nhóm (Team Member). Bản Pro giới hạn tối đa 2 Guests cộng tác bên ngoài miễn phí trên mỗi tài liệu, do đó không thể dùng phương án Guest miễn phí cho 40 Viewers.
    *   *Phương án đề xuất (An toàn)*: Đăng ký đầy đủ cho 50 users (10 Editors + 40 Viewers) trên Cloud Pro.
        *   *Chi phí*: 50 seats × $8 × 12 tháng = **$4,800 / năm** (~ 126,758,400 VNĐ).
    *   *Giải pháp thay thế*: Triển khai bản Grist Self-hosted (Community) để được sử dụng miễn phí hoàn toàn cho cả 50 users, chỉ chịu chi phí vận hành hạ tầng VPS.
*   **Giới hạn**: 100.000 bản ghi/document (đối với Cloud Pro).

#### D. Teable (Business Plan - Cloud)
*   **Giá niêm yết**: $20 / seat / tháng (Mở khóa Authority Matrix để phân quyền RLS).
*   **Chi phí**: 50 users × $20 × 12 tháng = **$12,000 / năm** (~ 316,896,000 VNĐ).
*   **Giới hạn**: 1.000.000 bản ghi/space.

---

### 3.3 Nhóm Self-hosted / Open-source (Công ty tự kiểm soát dữ liệu)
Nếu chọn hướng tự triển khai trên máy chủ của công ty (VM/VPS riêng, chạy Docker), chi phí bản quyền phần mềm sẽ bằng **$0** đối với các phiên bản Community/Open-source của Grist và Teable.

*   **Ước tính Chi phí Hạ tầng (Hàng năm)**:
    *   Máy chủ ảo (VPS/Cloud Server) cấu hình 4 vCPU / 8GB RAM / 100GB SSD (đủ chạy cho 50 user đồng thời và sao lưu tự động):
        *   Nhà cung cấp VPS giá rẻ (Hetzner / Contabo): ~$15 - $30/tháng = **$180 - $360 / năm** (~ 4,753,440 - 9,506,880 VNĐ).
        *   Nhà cung cấp Cloud lớn (AWS / GCP / Azure): ~$60 - $100/tháng = **$720 - $1,200 / năm** (~ 19,013,760 - 31,689,600 VNĐ).
    *   Tự động sao lưu (Backup storage): ~$50/năm = **1,320,400 VNĐ/năm**.
    *   **Tổng chi phí vận hành hạ tầng**: **~6,073,840 - 33,010,000 VNĐ/năm** (~ $230 - $1,250/năm).
*   **Chi phí vận hành kỹ thuật (Developer / DevOps)**: Tốn khoảng 3 - 5 ngày để thiết lập CI/CD, sao lưu tự động, và cấu hình SSL. Yêu cầu bảo trì, cập nhật hệ thống định kỳ (khoảng 2-4 giờ/tháng).
*   **So sánh giới hạn dòng của bản Self-hosted**:
    *   **Grist (Self-hosted)**: Bản Grist Core miễn phí, không giới hạn dòng cứng từ phần mềm. Giới hạn thực tế phụ thuộc vào tài nguyên RAM/CPU của server và độ phức tạp của các công thức tính toán.
    *   **Teable (Self-hosted)**: Teable Community/self-host chỉ được coi là conditional. Để có Authority Matrix/RLS và dung lượng sản xuất thực tế (capacity production), cần xác minh license self-host tương ứng; không được chốt chi phí chỉ bằng chi phí VPS trước khi thực hiện POC và kiểm tra điều khoản bản quyền (pricing chính thức của Teable giới hạn bản Free 1.000 dòng, Pro 250K dòng, Business $20/seat/tháng cho 1 triệu dòng và Authority Matrix nằm trong gói Business).
    *   **SeaTable (Self-hosted)**: Gói Enterprise Self-hosted có chi phí bản quyền rất cao (~199.644.480 VNĐ/năm cho 50 users), không tối ưu nên không ưu tiên khảo sát.

---

## 4. Quyết định Kiểm soát Dữ liệu (Handoff Q3 Check)
Đáp ứng yêu cầu đánh giá quyền làm chủ cơ sở dữ liệu như Supabase hiện tại của công ty, dưới đây là bảng đối chiếu khả năng backup, export và database ownership của các nền tảng hàng đầu:

| Nền tảng | Export dữ liệu gốc | Cơ chế Tự động Sao lưu (Auto-backup) | Khả năng tự sở hữu Database Postgres | Quyền kiểm soát dữ liệu |
| :--- | :--- | :--- | :--- | :--- |
| **Lark Base** | Export ra Excel/CSV (Mất quan hệ Linked records/công thức). | Chỉ có thể tự lập trình API tải file định kỳ hoặc trigger thủ công. | Không (Dữ liệu chạy trên hạ tầng ByteDance Cloud). | ❌ Rất thấp (Vendor Lock-in) |
| **Airtable** | Export ra CSV (Mất định dạng công thức/quan hệ). | Tự động backup nội bộ trên Cloud; tải về ngoài cần qua API. | Không (Hạ tầng AWS của Airtable US). | ❌ Rất thấp (Vendor Lock-in) |
| **Grist** | Xuất toàn bộ file SQLite `.grist` (Giữ nguyên 100% công thức, data, quan hệ). | Có sẵn cơ chế tự động backup snapshot trong phần mềm; tải file cực kỳ đơn giản. | Tự sở hữu (Dữ liệu nằm trong file SQLite cục bộ trên server của mình). | ⭐⭐⭐ Cao nhất (Làm chủ hoàn toàn) |
| **Teable** | Xuất ra Excel/CSV. Đầy đủ API xuất bản ghi. | Sử dụng công cụ backup PostgreSQL tiêu chuẩn (`pg_dump`). | Có (Chạy trực tiếp trên Postgres của công ty, tự quản lý). | ⭐⭐⭐ Cao (Làm chủ database) |

---

## 5. Kết luận Vòng Khảo sát Sơ bộ
Để tiến hành bước tiếp theo (Proof of Concept - POC) trên dữ liệu thực tế nhằm thu thập bằng chứng đầy đủ trước khi trình duyệt lên anh Hiếu, chúng ta sẽ lọc ra **3 ứng viên sáng giá nhất**:

1.  **Lark Base (Top 1 SaaS)**: Đại diện cho sự mượt mà tối đa của đám mây doanh nghiệp, tích hợp chat/notifications, phân quyền dòng trực quan, giao diện thân thiện với ops Việt Nam. Chi phí hợp lý (~38 triệu VNĐ/năm nếu dùng tối ưu).
2.  **Teable (Top 1 Postgres Airtable-clone)**: Đại diện cho hiệu năng xử lý dữ liệu lớn (hàng triệu dòng nhờ kiến trúc Postgres) và giao diện giống hệt Airtable.
3.  **Grist (Top 1 Open-source / Self-hosted)**: Nền tảng có hệ thống phân quyền dòng mạnh mẽ nhất (viết bằng biểu thức Python logic cao), tính toán dữ liệu nhanh và cho phép tùy biến giao diện đa dạng (multi-widget dashboard). Hoàn toàn miễn phí khi tự host.
