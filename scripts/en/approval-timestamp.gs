/**
 * Victoria TL3 - Approval Timestamp Script (English tab names)
 *
 * Install: Extensions -> Apps Script -> paste this -> Save
 *
 * When the "Approved" checkbox (column G) is toggled to TRUE,
 * this script auto-fills:
 *   - Column H (Approved by) with the editor's email
 *   - Column I (Approved at) with the current timestamp
 *
 * Works on tabs: Menu, Announcements, Schedule
 * NOTE: these tab names must match the tabs in your Google Sheet.
 */

const TRACKED_TABS = ['Menu', 'Announcements', 'Schedule'];
const APPROVAL_COL = 7;      // Column G = "Approved" (1-indexed)
const APPROVER_COL = 8;      // Column H = "Approved by"
const TIMESTAMP_COL = 9;     // Column I = "Approved at"
const HEADER_ROW = 1;

function onEdit(e) {
  if (!e || !e.range) return;

  const sheet = e.range.getSheet();
  const sheetName = sheet.getName();

  // Only act on tracked tabs
  if (!TRACKED_TABS.includes(sheetName)) return;

  const row = e.range.getRow();
  const col = e.range.getColumn();

  // Only act on the "Approved" column, skip header
  if (col !== APPROVAL_COL || row <= HEADER_ROW) return;

  const isApproved = e.range.getValue();

  if (isApproved === true) {
    // Stamp approver and timestamp
    const approverEmail = Session.getActiveUser().getEmail();
    const timestamp = new Date();

    sheet.getRange(row, APPROVER_COL).setValue(approverEmail);
    sheet.getRange(row, TIMESTAMP_COL).setValue(timestamp);
  } else {
    // Checkbox unchecked - clear the approval fields
    sheet.getRange(row, APPROVER_COL).clearContent();
    sheet.getRange(row, TIMESTAMP_COL).clearContent();
  }
}
