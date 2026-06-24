// Lark Base Script — Đối soát SePay
//
// Flow:
//   1. Kế toán click Run → script hiện file picker
//   2. User chọn file SePay export (.xlsx hoặc .csv)
//   3. Script parse → dedup theo Mã giao dịch SePay → insert vào bảng "GD SePay"
//   4. (TODO) Match với Payments → set DuplexLink "Payment khớp"
//   5. Output: số dòng đã insert / skip / failed
//
// Prereq: copy _shared.js vào cùng script (paste trên đầu file, hoặc include
// snippet helpers cần thiết).

// =================== CONFIG ===================

const TABLE_NAME_SEPAY = 'GD SePay';
const TABLE_NAME_PAYMENTS = 'Payments';

// Tên field trên bảng GD SePay (verify match schema)
const FIELD_SEPAY = {
  TXN_ID:          'Mã giao dịch SePay',     // primary, dedup key
  SOURCE:          'Nguồn dữ liệu',          // SingleSelect: Webhook / Poll / Nhập tay
  ACCOUNT:         'Số tài khoản nhận',
  SUB_ACCOUNT:     'Tài khoản phụ (VA)',
  AMOUNT:          'Số tiền (VND)',
  CONTENT:         'Nội dung CK',
  TXN_TIME:        'Thời gian giao dịch',
  STATUS:          'Trạng thái đối soát',
  PAYMENT_LINK:    'Payment khớp',           // DuplexLink → Payments
  CREATED_AT:      'Ngày bản ghi tạo',
};

// Mapping cột file SePay → field trên Base
// Source: app GMV `backend/sepay_routes.py` — _extract_sepay_transaction_fields()
// SePay webhook + poll API có nhiều tên khác nhau cho cùng 1 field, dùng helper
// firstValue để check theo thứ tự ưu tiên.
const SEPAY_FIELD_ALIASES = {
  TXN_ID:       ['id', 'sepay_id', 'transaction_id', 'transactionId'],
  AMOUNT_IN:    ['transferAmount', 'transfer_amount', 'amount', 'amount_in',
                 'amountIn', 'money_in', 'inAmount', 'creditAmount', 'credit_amount'],
  AMOUNT_OUT:   ['amount_out', 'amountOut', 'money_out', 'outAmount',
                 'debitAmount', 'debit_amount'],
  CONTENT:      ['content', 'transferContent', 'transfer_content',
                 'transaction_content', 'transactionContent',
                 'description', 'note', 'remark'],
  ACCOUNT:      ['accountNumber', 'account_number', 'bank_account',
                 'bankAccount', 'accountNo', 'account_no'],
  SUB_ACCOUNT:  ['subAccount', 'sub_account'],
  TXN_TIME:     ['transactionDate', 'transaction_date', 'when', 'created_at',
                 'createdAt', 'time'],
};

// Helper: lấy giá trị đầu tiên không rỗng theo danh sách alias
function firstValue(row, aliases) {
  for (const key of aliases) {
    const v = row[key];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

// Helper: extract amount (incoming positive, outgoing negative)
function extractAmount(row) {
  const incoming = Number(firstValue(row, SEPAY_FIELD_ALIASES.AMOUNT_IN) || 0);
  if (incoming) return incoming;
  const outgoing = Number(firstValue(row, SEPAY_FIELD_ALIASES.AMOUNT_OUT) || 0);
  if (outgoing) return -Math.abs(outgoing);
  return 0;
}

// Pattern nhận diện mPOS settlement → skip insert (chỉ ghi nhận, không match)
const MPOS_SETTLE_PATTERNS = [
  /MPOS\s*SETTLE/i,
  /KET\s*TOAN.*MPOS/i,
  /PAYOO.*SETTLE/i,
  /THANH\s*TOAN\s*THE.*MPOS/i,
];

function isMposSettlement(content) {
  return MPOS_SETTLE_PATTERNS.some(p => p.test(content || ''));
}

// =================== MAIN ===================

(async () => {
  output.text('Bắt đầu đối soát SePay...\n');

  // 1. Pick file
  const file = await input.fileAsync('Chọn file SePay export (.xlsx / .csv)');
  if (!file) {
    output.text('Không có file. Dừng.');
    return;
  }

  // 2. Parse
  const rows = await parseFile(file);
  output.text(`Parse được ${rows.length} dòng từ file.\n`);

  // 3. Filter mPOS settlement (ignore — chỉ insert giao dịch khách trả tiền)
  const sepayRows = rows.filter(row => {
    const content = firstValue(row, SEPAY_FIELD_ALIASES.CONTENT) || '';
    return !isMposSettlement(content);
  });
  output.text(`Lọc mPOS settlement: bỏ qua ${rows.length - sepayRows.length} dòng.\n`);

  // 4. Dedup
  const sepayTable = bitable.base.getTableByName(TABLE_NAME_SEPAY);
  const existingKeys = await getExistingPrimaryKeys(sepayTable, FIELD_SEPAY.TXN_ID);
  const newRows = sepayRows.filter(row => {
    const txnId = String(firstValue(row, SEPAY_FIELD_ALIASES.TXN_ID) || '').trim();
    return txnId && !existingKeys.has(txnId);
  });
  output.text(`Dedup: ${sepayRows.length - newRows.length} dòng đã có, ${newRows.length} dòng mới.\n`);

  // 5. Insert
  const mapFn = (row) => ({
    [FIELD_SEPAY.TXN_ID]:       String(firstValue(row, SEPAY_FIELD_ALIASES.TXN_ID)),
    [FIELD_SEPAY.AMOUNT]:       extractAmount(row),
    [FIELD_SEPAY.CONTENT]:      String(firstValue(row, SEPAY_FIELD_ALIASES.CONTENT) || ''),
    [FIELD_SEPAY.TXN_TIME]:     new Date(firstValue(row, SEPAY_FIELD_ALIASES.TXN_TIME)).getTime(),
    [FIELD_SEPAY.ACCOUNT]:      String(firstValue(row, SEPAY_FIELD_ALIASES.ACCOUNT) || ''),
    [FIELD_SEPAY.SUB_ACCOUNT]:  String(firstValue(row, SEPAY_FIELD_ALIASES.SUB_ACCOUNT) || ''),
    [FIELD_SEPAY.SOURCE]:       'Nhập tay',
    [FIELD_SEPAY.STATUS]:       'Chờ xử lý',
  });
  const { inserted, failed } = await insertRecords(sepayTable, newRows, mapFn);
  output.text(`Insert: ${inserted} thành công, ${failed} fail.\n`);

  // 6. Match (TODO)
  output.text('Match logic: TODO (chưa implement)\n');

  output.text('\nDone.');
})();
