/**
 * Victoria TL3 — Approval Timestamp Script
 *
 * Install: Extensions → Apps Script → paste this → Save
 *
 * When the "Duyệt" checkbox (column G) is toggled to TRUE on a content tab,
 * this script auto-fills:
 *   - Column H (Người duyệt) with the editor's email
 *   - Column I (Thời điểm duyệt) with the current timestamp
 *
 * Content tabs come from the Config tab, key CONTENT_TABS (comma-separated),
 * the same list workflows C, D and Z use. Falls back to DEFAULT_TABS.
 *
 * Personal Google accounts: Apps Script cannot see another person's email, so
 * getActiveUser() is often empty. The script then writes UNKNOWN_APPROVER so the
 * gap is visible; the Sheet's version history still shows who ticked the box.
 * Approving through the Zalo bot ("duyệt tb 12") records the approver reliably.
 */

const DEFAULT_TABS = ['Thực đơn', 'Thông báo', 'Lịch/TKB', 'Tin hoạt động'];
const APPROVAL_COL = 7;      // Column G = "Duyệt" (1-indexed)
const APPROVER_COL = 8;      // Column H = "Người duyệt"
const TIMESTAMP_COL = 9;     // Column I = "Thời điểm duyệt"
const HEADER_ROW = 1;
const UNKNOWN_APPROVER = 'không xác định (xem lịch sử phiên bản)';

function trackedTabs_(ss) {
  const config = ss.getSheetByName('Config');
  if (!config) return DEFAULT_TABS;
  const rows = config.getDataRange().getValues();
  for (const r of rows) {
    if (String(r[0]).trim() === 'CONTENT_TABS' && String(r[1]).trim()) {
      return String(r[1]).split(',').map((t) => t.trim()).filter(Boolean);
    }
  }
  return DEFAULT_TABS;
}

function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  if (!trackedTabs_(sheet.getParent()).includes(sheet.getName())) return;

  const row = e.range.getRow();
  const col = e.range.getColumn();

  // Only act on the "Duyệt" column, skip header
  if (col !== APPROVAL_COL || row <= HEADER_ROW) return;

  if (e.range.getValue() === true) {
    const approverEmail = Session.getActiveUser().getEmail() || UNKNOWN_APPROVER;
    sheet.getRange(row, APPROVER_COL).setValue(approverEmail);
    sheet.getRange(row, TIMESTAMP_COL).setValue(new Date());
  } else {
    // Checkbox unchecked — clear the approval fields
    sheet.getRange(row, APPROVER_COL).clearContent();
    sheet.getRange(row, TIMESTAMP_COL).clearContent();
  }
}
