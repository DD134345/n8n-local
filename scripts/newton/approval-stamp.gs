/** Newton – approval stamp v2. Header-name based; rejects non-approvers; stamps a content hash.
 *  Install as an INSTALLABLE "On edit" trigger (Extensions → Apps Script → Triggers → Add →
 *  onApprovalEdit, event "On edit"), run by the school account that owns the Sheet.
 *
 *  Config tab needs APPROVER_EMAILS (comma-separated, lowercased).
 *  Thời điểm duyệt is written as text 'dd/MM/yyyy HH:mm' (Asia/Ho_Chi_Minh).
 *
 *  IMPORTANT: With personal Gmail editors, Google may return an empty email.
 *  In that case the tick is rejected on purpose (test with each approver before go-live).
 */
const TABS = ['Trang', 'Tin tức', 'Thông báo', 'Thực đơn', 'Kế hoạch', 'Học phí', 'Giáo viên', 'Hội đồng', 'Công khai', 'Album', 'Thu hồi'];
const H = { approve: 'Duyệt', by: 'Người duyệt', at: 'Thời điểm duyệt', hash: 'Mã băm duyệt', status: 'Trạng thái', note: 'Ghi chú' };
// Columns that must NOT be part of the hash (outputs written after approval).
const EXCLUDE = ['Trạng thái', 'Duyệt', 'Người duyệt', 'Thời điểm duyệt', 'Mã băm duyệt', 'Đã đăng', 'URL', 'Commit SHA', 'Đã xác minh lúc', 'Ghi chú', 'QA điểm', 'QA ghi chú', 'Mô hình', 'Phiên bản prompt'];

function onApprovalEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (!TABS.includes(sh.getName()) || e.range.getRow() < 2) return;
  const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const col = (name) => head.indexOf(name) + 1;
  if (e.range.getColumn() !== col(H.approve) || e.range.getNumRows() !== 1) return;

  const row = e.range.getRow();
  const ticked = e.range.getValue() === true;
  const email = (e.user && e.user.getEmail && e.user.getEmail()) || Session.getActiveUser().getEmail() || '';
  const allow = readConfig_('APPROVER_EMAILS').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

  if (!ticked) { clear_(sh, row, col); return; }
  if (!email || !allow.includes(email.toLowerCase())) {
    e.range.setValue(false); clear_(sh, row, col);
    sh.getRange(row, col(H.note)).setValue('Từ chối duyệt: ' + (email || 'không xác định được email') + ' không có quyền duyệt');
    return;
  }
  const disp = sh.getRange(row, 1, 1, head.length).getDisplayValues()[0];
  const pairs = [];
  head.forEach((h, i) => {
    const name = String(h).trim();
    const val = String(disp[i] == null ? '' : disp[i]).trim();
    if (!name || EXCLUDE.includes(name) || val === '') return;
    pairs.push(name + '=' + val);
  });
  pairs.sort();
  const payload = pairs.join('\u241F');
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, payload, Utilities.Charset.UTF_8)
                .map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
  sh.getRange(row, col(H.by)).setValue(email);
  sh.getRange(row, col(H.at)).setValue(Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'dd/MM/yyyy HH:mm'));
  sh.getRange(row, col(H.hash)).setValue(hash);
}

function clear_(sh, row, col) {
  [H.by, H.at, H.hash].forEach(n => { const c = col(n); if (c > 0) sh.getRange(row, c).clearContent(); });
}
function readConfig_(key) {
  const rows = SpreadsheetApp.getActive().getSheetByName('Config').getDataRange().getValues();
  const hit = rows.find(r => String(r[0]).trim() === key);
  return hit ? String(hit[1]) : '';
}