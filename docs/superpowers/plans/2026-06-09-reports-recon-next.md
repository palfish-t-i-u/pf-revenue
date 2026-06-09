# Reports And Reconciliation Next Steps

| Task | Mục tiêu | File chính | Phụ thuộc | Cách verify |
|---|---|---|---|---|
| 1. Sửa contract `ReportsSubTab` | Đồng bộ params `from/to` và shape response giữa FE `ReportsSubTab` với BE `payment_report_routes.py`, bỏ mismatch âm thầm làm báo cáo fail hoặc rỗng dữ liệu | `frontend/src/components/PaymentsTab.tsx`, `backend/payment_report_routes.py` | Không phụ thuộc task khác | Gọi từng tab `bctb/team/channel`, kiểm tra network 200, bảng render đúng và export vẫn tải được |
| 2. Sửa logic báo cáo | Chốt lại rule tính report theo spec hiện tại: chỉ lấy `status='active'`, xác định BCTB hiển thị metric nào theo ngày, thống nhất tên field `crm_name/full_name`, và nếu cần thì mở rộng payload BE thay vì để FE tự đoán | `backend/payment_report_routes.py`, `frontend/src/components/PaymentsTab.tsx`, có thể thêm helper trong `backend/payment_logic.py` nếu tách rule | Nên làm sau task 1 để contract ổn định trước | So sánh số liệu report với summary/payments list trên cùng khoảng ngày; test case có refunded để chắc report loại trừ đúng |
| 3. Hoàn thiện `Đối soát` v1 | Nâng sub-tab `Recon` từ chỉ có internal warnings lên đủ 3 khối: cảnh báo nội bộ, upload/khớp file ngân hàng, và danh sách CRM chưa kích hoạt theo tuổi đơn | `frontend/src/components/PaymentsTab.tsx`, `backend/payment_report_routes.py` hoặc tách `backend/payment_recon_routes.py`, có thể cần migration/SQL cho `bank_transactions` và RPC warnings | Nên làm sau task 2 để reuse rule lọc payments đã ổn định | Upload file bank mẫu, kiểm tra matched/unmatched, manual match flow, CRM aging list, và internal warnings vẫn chạy |

## Gợi ý thứ tự triển khai

1. Khoá contract `reports` trước để FE/BE nói cùng một ngôn ngữ.
2. Sửa logic số liệu khi contract đã ổn định, tránh sửa UI hai lần.
3. Mở rộng `Đối soát` sau cùng vì nó phụ thuộc trực tiếp vào rule payments/reports đã chốt.

## Ghi chú phạm vi

- Chưa cần viết SOP vận hành ở giai đoạn này.
- Nếu `Recon` nở lớn, nên tách khỏi `PaymentsTab.tsx` thành component con để giảm rủi ro khi sửa tiếp.
