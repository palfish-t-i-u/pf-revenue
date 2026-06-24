// Shared helpers — copy đoạn cần thiết vào đầu mỗi script Lark Base.
// Note: Lark Script chưa hỗ trợ ES module import giữa các script khác nhau.

// =================== STATUS ENUMS ===================
const STATUS = {
  PENDING:  'Chờ xử lý',
  MATCHED:  'Đã khớp',
  REVIEW:   'Cần review',
  IGNORED:  'Bỏ qua',
};

// =================== File parser ===================
// Lark Base `input.fileAsync()` trả về File object có .name + .arrayBuffer().
// Đối với .csv: parse text. Đối với .xlsx: cần lib SheetJS (XLSX.read).
// TODO: verify Lark Base có whitelist SheetJS không. Nếu không, user phải
// export sang .csv trước.
async function parseFile(file) {
  const name = (file?.name || '').toLowerCase();
  if (name.endsWith('.csv')) {
    return await parseCsv(file);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    // TODO: verify SheetJS availability trong runtime Lark Script
    throw new Error('xlsx chưa được hỗ trợ. Vui lòng export file dưới định dạng CSV.');
  }
  throw new Error(`Định dạng không hỗ trợ: ${file?.name}`);
}

async function parseCsv(file) {
  const buffer = await file.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buffer);
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, i) => obj[h] = cells[i] ?? '');
    return obj;
  });
}

function splitCsvLine(line) {
  const result = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur);
  return result;
}

// =================== Dedup ===================
async function getExistingPrimaryKeys(table, primaryFieldName) {
  const records = await table.getRecords();
  const set = new Set();
  for (const rec of records.records) {
    const v = rec.getCellValueString(primaryFieldName);
    if (v) set.add(String(v).trim());
  }
  return set;
}

// =================== Insert ===================
async function insertRecords(table, rows, mapFn) {
  let inserted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const fields = mapFn(row);
      await table.addRecord({ fields });
      inserted++;
    } catch (e) {
      failed++;
      console.error('Insert fail:', e?.message || e);
    }
  }
  return { inserted, failed };
}

// =================== Match Payments (TODO) ===================
// Khung match — chưa quyết rule cụ thể. Cần spec từ ops:
//   - Amount tolerance (exact / ±fee / %?)
//   - Date window (0 / ±3 / ±7 ngày?)
//   - Content keyword (transfer_code? UID? tên KH?)
//   - Khi multiple candidates → auto-pick gần nhất, hay always needs_review?
async function matchPayments(gatewayTable, paymentsTable, opts) {
  // TODO: implement
  // 1. Load tất cả payments có status='Chờ thanh toán'
  // 2. Với mỗi GD trong gatewayTable status='Chờ xử lý', tìm payment khớp
  // 3. Set DuplexLink "Payment khớp" + đổi status
  throw new Error('matchPayments chưa implement — chờ spec rule');
}
