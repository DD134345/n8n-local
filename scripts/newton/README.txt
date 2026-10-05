Newton – approval-stamp.gs installation
=========================================

1. Open the Google Sheet "Newton – Website".
2. Extensions → Apps Script.
3. Delete any existing code, paste the contents of approval-stamp.gs.
4. Save (Ctrl+S), name the project "Newton Approval Stamp".
5. Click the clock icon (Triggers) → Add Trigger:
   - Choose function: onApprovalEdit
   - Event source: From spreadsheet
   - Event type: On edit
   - Failure notification: Notify me daily (or immediately)
6. The trigger MUST run as the SCHOOL ACCOUNT that owns the Sheet
   (not a personal Gmail). In the trigger dialog, "Run as" should show
   the school email.

Config tab setup
----------------
In the "Config" tab (columns Khoá | Giá trị), add:
  APPROVER_EMAILS = hieutruong@school.edu.vn, phohieutruong@school.edu.vn
(Lowercase, comma-separated. No spaces after commas needed but allowed.)

Behaviour
---------
- When an allowlisted approver ticks the "Duyệt" checkbox (TRUE):
    * Writes their email to "Người duyệt"
    * Writes current time (Asia/Ho_Chi_Minh) as 'dd/MM/yyyy HH:mm' to "Thời điểm duyệt"
    * Computes a SHA-256 hash of all non-excluded, non-empty content columns
      (header=value pairs, sorted, joined by U+241F "␟") and writes it to "Mã băm duyệt"
- If a non-approver (or empty email) ticks: tick is reverted, note written.
- Unticking clears the three stamp columns.

IMPORTANT WARNING
-----------------
With personal Gmail editors (outside the school's Workspace domain),
`Session.getActiveUser().getEmail()` and `e.user.getEmail()` can return
an empty string. In that case the tick is REJECTED ON PURPOSE — the
approver will see the note "Từ chối duyệt: không xác định được email
không có quyền duyệt".

TEST WITH EACH APPROVER BEFORE GO-LIVE:
1. Each approver opens the Sheet, ticks a test row's "Duyệt".
2. Verify: email stamped, time stamped, 64-char hash in "Mã băm duyệt".
3. If any approver gets the rejection note, their account is not
   recognized — they must use a school Workspace account, or the Sheet
   must be shared with their account in a way that preserves identity.

n8n recomputes the identical hash (workflows/newton/nwt-p-publisher-astro.json,
Code node "Chọn tuần cần đăng"). Mismatch → status "Đã sửa sau duyệt".