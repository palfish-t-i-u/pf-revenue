// Lark Base Script — Đối soát mPOS / Payoo
//
// Flow:
//   1. Kế toán click Run → script hỏi: nguồn là mPOS hay Payoo? + chọn file
//   2. Parse file theo format của nguồn tương ứng
//   3. Dedup theo Mã giao dịch → insert vào bảng "GD mPOS/Payoo"
//   4. (TODO) Match với Payments → set DuplexLink "Payment khớp"
//   5. Output: số dòng đã insert / skip / failed
//
// Prereq: copy _shared.js vào cùng script.

// =================== CONFIG ===================

const TABLE_NAME_GATEWAY = 'GD mPOS/Payoo';
const TABLE_NAME_PAYMENTS = 'Payments';

const FIELD_GATEWAY = {
  TXN_ID:         'Mã giao dịch',           // primary, dedup key
  SOURCE:         'Cổng thanh toán',        // SingleSelect: mPOS / Payoo
  CATEGORY:       'Loại giao dịch',
  SETTLEMENT:     'Mã đợt settlement',
  CARDHOLDER:     'Tên chủ thẻ',
  CARD_MASKED:    'Số thẻ (che)',
  CARD_TYPE:      'Loại thẻ',
  GROSS:          'Số tiền khách trả (VND)',
  FEE:            'Phí cổng (VND)',
  NET:            'Số tiền thực nhận (VND)',
  INSTALLMENT:    'Số kỳ trả góp',
  BANK:           'Ngân hàng phát hành',
  REGION:         'Vùng thu',
  TXN_TIME:       'Thời gian quẹt thẻ',
  STATUS:         'Trạng thái đối soát',
  PAYMENT_LINK:   'Payment khớp',           // DuplexLink → Payments
};

// Mapping cột file thực tế — port từ app GMV `backend/mpos_import.py`
// Tên cột tiếng Việt, mỗi field có nhiều alias (file export khác version)

// mPOS detail report (file: "Bảng kê chi tiết giao dịch")
const MPOS_ALIASES = {
  TXN_ID:         ['Số giao dịch', 'Mã tham chiếu (Ref No.)'],
  CATEGORY:       ['Chi tiết giao dịch'],
  STATUS:         ['Trạng thái giao dịch'],
  GROSS:          ['Số tiền'],
  FEE:            ['Phí giao dịch'],
  NET:            ['Số tiền thực nhận', 'Số tiền được nhận'],
  CARDHOLDER:     ['Tên chủ thẻ'],
  CARD_MASKED:    ['Số thẻ'],
  CARD_TYPE:      ['Loại thẻ'],
  COLLECTOR:      ['TK thanh toán'],   // palfish02=HCM, palfish3=HN
  SETTLEMENT:     ['Mã phiếu chi', 'Mã chuẩn chi'],
  INSTALLMENT:    ['Kỳ hạn'],
  INSTALLMENT_FEE:['Phí trả góp'],
  BANK:           ['NH Hỗ trợ', 'Ngân hàng'],
  STORE:          ['Tên cửa hàng', 'Business name'],
  TXN_TIME:       ['Ngày khởi tạo', 'Thời gian'],
};

// Payoo online (file: "Báo cáo giao dịch online")
const PAYOO_ONLINE_ALIASES = {
  TXN_ID:         ['Mã đơn hàng'],
  PAYMENT_CODE:   ['Mã thanh toán'],
  SETTLEMENT:     ['Mã chuẩn chi'],
  TXN_TIME:       ['Ngày thanh toán'],
  GROSS:          ['Số tiền'],
  FEE:            ['Phí thanh toán'],
  NET:            ['Số tiền sau phí'],
  CARDHOLDER:     ['Tên chủ thẻ'],
  CARD_MASKED:    ['Số thẻ'],
  CARD_TYPE:      ['Hình thức phát hành thẻ', 'Nguồn tiền'],
  METHOD:         ['Hình thức thanh toán'],
  STORE:          ['Tên cửa hàng'],
};

// Payoo installment (file: "Báo cáo trả góp")
const PAYOO_INSTALLMENT_ALIASES = {
  TXN_ID:         ['Mã ĐH/GD trả góp'],
  SETTLEMENT:     ['Mã chuẩn chi'],
  TXN_TIME:       ['Ngày cập nhật', 'Ngày tạo giao dịch'],
  GROSS:          ['Số tiền'],
  INSTALLMENT_AMT:['Số tiền trả góp'],
  FEE:            ['Phí thanh toán thẻ', 'Phí dịch vụ thu KH'],
  INSTALLMENT_FEE:['Phí trả góp'],
  NET:            ['Số tiền sau phí'],
  INSTALLMENT:    ['Kỳ hạn'],
  CARDHOLDER:     ['Tên chủ thẻ'],
  CARD_MASKED:    ['Số thẻ'],
  CARD_TYPE:      ['Loại thẻ'],
  BANK:           ['Ngân hàng'],
  STORE:          ['Tên cửa hàng'],
};

// Map TK thanh toán → vùng thu
const COLLECTOR_REGION = {
  'palfish02': 'HCM',
  'palfish3':  'HN',
};

// Status nghĩa "Đảo" = giao dịch hủy (skip không insert)
const MPOS_STATUS_REVERSED = 'Đảo';

// Helper: lấy giá trị đầu theo alias
function firstValue(row, aliases) {
  for (const key of aliases) {
    const v = row[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return null;
}

// Helper: parse số theo format VN ("9.080.000" / "9,080,000" / "8,215.50")
function parseAmount(v) {
  let text = String(v ?? '').replace(/[ \s]/g, '');
  if (!text) return 0;
  const hasComma = text.includes(',');
  const hasDot = text.includes('.');
  if (hasComma && hasDot) {
    text = text.lastIndexOf('.') > text.lastIndexOf(',')
      ? text.replace(/,/g, '')
      : text.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    const parts = text.split(',');
    text = (parts.length === 2 && parts[1].length <= 2 && /^\d+$/.test(parts[1]))
      ? text.replace(',', '.')
      : text.replace(/,/g, '');
  } else if (hasDot) {
    const parts = text.split('.');
    if (!(parts.length === 2 && parts[1].length <= 2 && /^\d+$/.test(parts[1]))) {
      text = text.replace(/\./g, '');
    }
  }
  text = text.replace(/[^\d.\-]/g, '');
  const n = parseFloat(text);
  return isNaN(n) ? 0 : n;
}

// =================== MAIN ===================

(async () => {
  output.text('Bắt đầu đối soát mPOS/Payoo...\n');

  // 1. Pick source + file
  const source = await input.buttonsAsync('Nguồn dữ liệu?', [
    { label: 'mPOS', value: 'mPOS' },
    { label: 'Payoo Online', value: 'Payoo Online' },
    { label: 'Payoo Trả góp', value: 'Payoo Installment' },
  ]);
  if (!source) return;

  const file = await input.fileAsync(`Chọn file ${source} export (.xlsx / .csv)`);
  if (!file) {
    output.text('Không có file. Dừng.');
    return;
  }

  // 2. Parse — schema khác nhau giữa mPOS / Payoo Online / Payoo Installment
  const aliases = source === 'mPOS' ? MPOS_ALIASES
                : source === 'Payoo Online' ? PAYOO_ONLINE_ALIASES
                : PAYOO_INSTALLMENT_ALIASES;
  const rows = await parseFile(file);
  output.text(`Parse được ${rows.length} dòng từ file ${source}.\n`);

  // 3. Lọc giao dịch đảo (chỉ mPOS) — không insert
  const filteredRows = rows.filter(row => {
    if (source !== 'mPOS') return true;
    const status = String(firstValue(row, MPOS_ALIASES.STATUS) || '');
    return status.trim() !== MPOS_STATUS_REVERSED;
  });
  if (source === 'mPOS') {
    output.text(`Lọc giao dịch đảo: bỏ qua ${rows.length - filteredRows.length} dòng.\n`);
  }

  // 4. Dedup
  const gatewayTable = bitable.base.getTableByName(TABLE_NAME_GATEWAY);
  const existingKeys = await getExistingPrimaryKeys(gatewayTable, FIELD_GATEWAY.TXN_ID);
  const newRows = filteredRows.filter(row => {
    const txnId = String(firstValue(row, aliases.TXN_ID) || '').trim();
    return txnId && !existingKeys.has(txnId);
  });
  output.text(`Dedup: ${filteredRows.length - newRows.length} dòng đã có, ${newRows.length} dòng mới.\n`);

  // 5. Insert
  const mapFn = (row) => {
    const fields = {
      [FIELD_GATEWAY.TXN_ID]:       String(firstValue(row, aliases.TXN_ID)),
      [FIELD_GATEWAY.SOURCE]:       source === 'mPOS' ? 'mPOS' : 'Payoo',
      [FIELD_GATEWAY.GROSS]:        parseAmount(firstValue(row, aliases.GROSS)),
      [FIELD_GATEWAY.FEE]:          parseAmount(firstValue(row, aliases.FEE)),
      [FIELD_GATEWAY.NET]:          parseAmount(firstValue(row, aliases.NET)),
      [FIELD_GATEWAY.TXN_TIME]:     new Date(firstValue(row, aliases.TXN_TIME)).getTime(),
      [FIELD_GATEWAY.CARDHOLDER]:   String(firstValue(row, aliases.CARDHOLDER) || ''),
      [FIELD_GATEWAY.CARD_MASKED]:  String(firstValue(row, aliases.CARD_MASKED) || ''),
      [FIELD_GATEWAY.CARD_TYPE]:    String(firstValue(row, aliases.CARD_TYPE) || ''),
      [FIELD_GATEWAY.SETTLEMENT]:   String(firstValue(row, aliases.SETTLEMENT) || ''),
      [FIELD_GATEWAY.STATUS]:       'Chờ xử lý',
    };

    if (source === 'mPOS') {
      fields[FIELD_GATEWAY.CATEGORY]    = String(firstValue(row, MPOS_ALIASES.CATEGORY) || '');
      fields[FIELD_GATEWAY.INSTALLMENT] = parseAmount(firstValue(row, MPOS_ALIASES.INSTALLMENT));
      fields[FIELD_GATEWAY.BANK]        = String(firstValue(row, MPOS_ALIASES.BANK) || '');
      const collector = String(firstValue(row, MPOS_ALIASES.COLLECTOR) || '').toLowerCase();
      fields[FIELD_GATEWAY.REGION]      = COLLECTOR_REGION[collector] || '';
    } else if (source === 'Payoo Installment') {
      fields[FIELD_GATEWAY.INSTALLMENT] = parseAmount(firstValue(row, PAYOO_INSTALLMENT_ALIASES.INSTALLMENT));
      fields[FIELD_GATEWAY.BANK]        = String(firstValue(row, PAYOO_INSTALLMENT_ALIASES.BANK) || '');
    } else {
      fields[FIELD_GATEWAY.CATEGORY]    = String(firstValue(row, PAYOO_ONLINE_ALIASES.METHOD) || '');
    }
    return fields;
  };
  const { inserted, failed } = await insertRecords(gatewayTable, newRows, mapFn);
  output.text(`Insert: ${inserted} thành công, ${failed} fail.\n`);

  // 6. Match (TODO)
  output.text('Match logic: TODO (chưa implement)\n');

  output.text('\nDone.');
})();
