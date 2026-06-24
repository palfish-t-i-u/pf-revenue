# Lark Base — Khung script đối soát

> Phạm vi: bảng **Payments** + **GD SePay** + **GD mPOS/Payoo** trên Base `PalFish Revenue Manager`.
> Mục tiêu: kế toán upload file giao dịch ngân hàng (SePay) hoặc mPOS/Payoo → script tự parse, dedup, ghi vào bảng GD, match với Payments.

## Cấu trúc thư mục

| File | Mục đích |
|---|---|
| `reconcile-sepay.js` | Khung đối soát SePay — kế toán bấm nút, chọn file, script chạy |
| `reconcile-mpos-payoo.js` | Khung đối soát mPOS/Payoo — tương tự, parse format khác |
| `_shared.js` | Helpers chung: dedup, match logic, type converter |

## Quan hệ với backend

App `pf-revenue` (repo này) có endpoint `POST /api/v1/lark/sync-bank-transactions` tự động đổ giao dịch SePay từ Supabase `bank_transactions` (ghi bởi app GMV) sang bảng "GD SePay" mỗi 1-5 phút (Lark Automation trigger). Các script ở đây dùng cho luồng **manual upload** khi cần đối soát file export từ portal SePay/mPOS/Payoo trực tiếp trên Lark Base.

## Cách dùng trên Lark Base

1. Mở Base `PalFish Revenue Manager`
2. Click icon mở rộng (Extensions) bên phải → **Apps** → **Script** (hoặc tương đương trong Lark Base hiện tại — feature có thể tên khác giữa workspace)
3. **Add Script** → đặt tên `Đối soát SePay` hoặc `Đối soát mPOS/Payoo`
4. Copy nội dung file `.js` tương ứng vào editor
5. Save → script hiển thị trong panel Extensions
6. Kế toán click nút **Run** → script gọi `input.fileAsync()` mở file picker → chọn file `.xlsx`/`.csv`

## TODO khi triển khai

- [x] **Column mapping**: copy từ app GMV `backend/sepay_routes.py` (SePay) và `backend/mpos_import.py` (mPOS / Payoo Online / Payoo Installment) — 3 format Payoo + 1 format mPOS hỗ trợ sẵn
- [x] **mPOS settlement filter**: port `MPOS_SETTLE_PATTERNS` từ app GMV — bỏ qua giao dịch settlement không phải thanh toán khách
- [x] **Giao dịch đảo (mPOS)**: skip status "Đảo"
- [x] **Vùng thu mPOS**: map "TK thanh toán" → HCM/HN theo `COLLECTOR_MAP` (palfish02=HCM, palfish3=HN)
- [x] **Parse amount VN format**: port `_parse_amount()` — handle "9.080.000" / "9,080,000" / "8,215.50"
- [ ] **Logic match Payments**: khung `// TODO: match logic` trong `_shared.js` — cần spec rule (amount exact / window date / fuzzy content)
- [ ] **Test sandbox base trước khi chạy prod**
- [ ] **Quyền**: script chạy với quyền user click button. Kế toán cần có quyền edit 2 bảng GD + bảng Payments.
- [ ] **Lark Base scripting API**: verify cú pháp `bitable.base.getTableByName`, `input.fileAsync`, `input.buttonsAsync` trên workspace thực tế

## Reference

- Schema GD SePay: `GD SePay khớp` ↔ Payments qua DuplexLink `Payment khớp`
- Schema GD mPOS/Payoo: `GD mPOS/Payoo khớp` ↔ Payments qua DuplexLink `Payment khớp`
- Idempotency: Mã giao dịch SePay (SePay ID) + Mã giao dịch mPOS unique constraint chống trùng (đã set primary field)
