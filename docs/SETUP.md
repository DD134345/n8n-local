# SETUP: credentials and Sheet templates

Setup reference for the n8n workflows in this repo: which credentials to create in n8n, and how to
lay out the Google Sheet each campus uses. Start with the [Quick start in the README](../README.md#quick-start).

## Contents

- [Credential setup guide](#credential-setup-guide)
- [Sheet template (VI)](#sheet-template-vi)
- [Sheet template (EN)](#sheet-template-en)
- [Sheet rename map (VI to EN)](#sheet-rename-map)

---

<a id="credential-setup-guide"></a>

## Credential setup guide (VI = EN, identical)

## Credential Setup Guide — Victoria TL3 n8n Workflows

> Updated 10/10/2026 to match the current workflow files: Ollama runs natively on the Windows host
> (reached from the VM as `winhost`), email goes through the school SMTP/IMAP server (no Gmail
> node), C and D run on schedules (no Google Sheets Trigger), and runtime values live in the
> Sheet's `Config` tab (n8n `$vars` is not available on Community edition).

Create every credential in the n8n UI, then put each credential's ID (the last part of the URL
when you open it) into `infra/campuses.json`. `scripts/build-workflows.mjs` replaces the
`YOUR_<KEY>_CREDENTIAL_ID` placeholders with those IDs. The names below are the names the
workflow files expect.

| Key in `campuses.json` | n8n credential name | n8n type | Used by |
|---|---|---|---|
| `GOOGLE_SHEETS` | `Google Sheets OAuth2` | Google Sheets OAuth2 API | All (Sheets nodes + HTTP Request calls to the Sheets API in C, D, I, Z) |
| `OLLAMA` | `Ollama Local` | Ollama | C, G, I, Master |
| `GEMINI` | `Gemini API Free` | Google Gemini (PaLM) API | C (fallback only) |
| `SMTP` | `Victoria School SMTP` | SMTP | D, E, G, H, I, Master |
| `IMAP` | `Hộp thư tiếp nhận (IMAP)` | IMAP | I |
| `WORDPRESS` | `WordPress Application Password` | Basic Auth | D (only when `CMS_TYPE` = `wordpress`) |
| `N8N_API` | `n8n API Key` | Header Auth | Master |
| `FEATURE_WEBHOOK` | `Feature Webhook Key` | Header Auth | F |
| — (set by hand) | `GitHub PAT (website repo)` | Header Auth | Newton P (`workflows/newton/`) |
| — (set by hand) | `Google Sheets (Newton)`, `SMTP (school)` | Google Sheets OAuth2 API, SMTP | Newton P — can reuse the same Google OAuth client and SMTP details |
| — (not a credential) | Zalo bot token | `infra/zalo.env` | E, Z |

`GOOGLE_SHEETS_TRIGGER` in `campuses.example.json` is no longer used by any workflow; leave it empty.

---

### 1. Ollama (local LLM)

**Used by:** C, G, I, Master. Ollama is not in the Compose stack; it runs natively on Windows.

1. Install: https://docs.ollama.com/windows · pull the model: `ollama pull qwen2.5:7b`
2. Let the VM reach it: set the Windows user environment variable `OLLAMA_HOST=0.0.0.0:11434`,
   restart Ollama (https://docs.ollama.com/faq#how-can-i-expose-ollama-on-my-network), and allow
   TCP 11434 in Windows Firewall **from the VMnet8 subnet only**.
3. In n8n: Credentials → New → **Ollama** → Name `Ollama Local`, Base URL `http://winhost:11434`
   (`winhost` comes from `WIN_HOST_IP` in `infra/.env`). Test → green.

Check from the VM: `curl http://<WIN_HOST_IP>:11434/api/tags` should list `qwen2.5:7b`.

---

### 2. Google Sheets (OAuth2)

**Used by:** all workflows. One credential is enough.

1. Google Cloud Console (https://console.cloud.google.com/) → create or pick a project.
2. APIs & Services → Library → enable **Google Sheets API** and **Google Drive API**.
3. OAuth consent screen (https://developers.google.com/workspace/guides/configure-oauth-consent):
   set it up, then **publish it to "In production"**. In "Testing" mode Google expires the
   refresh token after 7 days and every Sheets node starts failing weekly.
4. Credentials → Create Credentials → OAuth client ID → **Web application**.
   Authorized redirect URI: `http://localhost:5678/rest/oauth2-credential/callback`
5. In n8n: Credentials → New → **Google Sheets OAuth2 API** → paste Client ID/Secret → **Connect**
   → name it `Google Sheets OAuth2`.
   - Do this from a browser where `http://localhost:5678` reaches n8n (the VM's own browser, or a
     VMware NAT port-forward 5678 → `VM_IP:5678`). Google rejects plain-http redirects to private IPs.
6. Share every campus Sheet with the Google account you connected (Editor).

n8n reference: https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service

---

### 3. SMTP — school mail server (outbound email)

**Used by:** D, E, G, H, I, Master. The system only sends; it never auto-replies to parents.

1. Ask the school's IT provider for host, port, username, password and SSL/TLS setting
   (see `SMTP_*` in the root `.env.example`).
2. In n8n: Credentials → New → **SMTP** → fill in those values → name `Victoria School SMTP`.
3. Put the sender address in the Sheet `Config` tab as `SMTP_FROM`.

If a Gmail account is used for testing, it needs an app password (https://support.google.com/mail/answer/185833).
n8n reference: https://docs.n8n.io/integrations/builtin/credentials/send-email

---

### 4. IMAP — intake mailbox

**Used by:** I (staff email intake). Use a mailbox dedicated to intake, not someone's personal inbox.

1. In n8n: Credentials → New → **IMAP** → host, port 993, user, password, SSL on.
2. Name it `Hộp thư tiếp nhận (IMAP)`.

n8n reference: https://docs.n8n.io/integrations/builtin/credentials/imap

---

### 5. Gemini API (free tier, fallback LLM)

**Used by:** C, only when Ollama is unavailable.

1. Create a key: https://aistudio.google.com/apikey
2. In n8n: Credentials → New → **Google Gemini (PaLM) API** → paste the key → name `Gemini API Free`.

Free-tier limits change per model and over time; check the current numbers in AI Studio
(https://ai.google.dev/gemini-api/docs/rate-limits). A fallback role uses very little.

---

### 6. WordPress Application Password (optional)

**Used by:** D, only when the `Config` tab has `CMS_TYPE` = `wordpress` (plus `WORDPRESS_URL`).
With `CMS_TYPE` = `manual`, D emails the approved content to the poster instead.

1. WordPress admin → Users → your profile → **Application Passwords** → name "n8n Victoria TL3" → Add New.
2. Copy the password (shown once).
3. In n8n: Credentials → New → **Basic Auth** → user = WordPress username, password = application
   password → name `WordPress Application Password`.

Reference: https://developer.wordpress.org/rest-api/using-the-rest-api/authentication/

---

### 7. n8n API key (Master Orchestrator)

**Used by:** Master (and the dashboard).

1. n8n → Settings → **n8n API** → Create an API key → copy it.
2. Credentials → New → **Header Auth** → Name `n8n API Key`, Header Name `X-N8N-API-KEY`,
   Value = the key.

Reference: https://docs.n8n.io/connect/n8n-api/authentication

---

### 8. Feature webhook key (Workflow F)

**Used by:** F. Credentials → New → **Header Auth** → name `Feature Webhook Key`; pick a header
name and a long random value. Whatever calls the webhook must send the same header.

---

### 9. GitHub token (Newton publisher, optional)

**Used by:** `workflows/newton/nwt-p-publisher-astro.json` (commits approved news to the Astro site repo).
This workflow is not processed by the build script; attach its credentials (this one, plus
`Google Sheets (Newton)` and `SMTP (school)`) by hand after import.

1. Create a **fine-grained** personal access token limited to the website repo, permission
   **Contents: Read and write** (https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
2. In n8n: Credentials → New → **Header Auth** → Name `GitHub PAT (website repo)`,
   Header Name `Authorization`, Value `Bearer <token>`.

API reference: https://docs.github.com/en/rest/repos/contents

---

### 10. Zalo bot token (not an n8n credential)

**Used by:** E (reminders by Zalo) and Z (staff gateway). One bot per campus.

1. Create the bot and copy its token: https://bot.zaloplatforms.com (docs: https://bot.zaloplatforms.com/docs)
2. Put it in `infra/zalo.env` (git-ignored), one line per campus: `ZALO_BOT_TOKEN_TL3=...`
3. `docker compose up -d` again so n8n picks it up.

The bot polls `getUpdates`, so no public URL is needed.

---

### Troubleshooting

| Problem | Solution |
|---------|----------|
| "Could not connect to Ollama" | On Windows: Ollama running, `OLLAMA_HOST=0.0.0.0:11434`, firewall rule for the VMnet8 subnet. In n8n the URL is `http://winhost:11434`, and `WIN_HOST_IP` in `infra/.env` matches `ipconfig` → VMware Network Adapter VMnet8 |
| Google OAuth "redirect_uri_mismatch" / blocked | Open n8n at `http://localhost:5678` (VM browser or port-forward), not `http://<VM_IP>:5678` |
| Sheets nodes fail about a week after connecting | OAuth consent screen is still in "Testing" — publish it to production and reconnect |
| "Insufficient permissions" on Sheets | Sheet not shared with the connected account, or Drive API not enabled |
| SMTP auth / TLS errors | Check port vs SSL setting with the school IT provider (587 = STARTTLS with SSL off; 465 = SSL on) |
| WordPress 401 | Wrong application password, or a security plugin (e.g. Wordfence) blocks the REST API |
| n8n API returns 401 | Regenerate the key in Settings → n8n API and update the `n8n API Key` credential |
| Zalo messages not received | Token missing from `infra/zalo.env`, or the container was not restarted after adding it |
| Build script stops with "unfilled values" | A credential ID is missing in `infra/campuses.json` |

---

<a id="sheet-template-vi"></a>

## Victoria TL3 Sheet template (VI)

### Version 1

## Victoria TL3 — Bảng Dữ Liệu Trung Tâm (Google Sheet Template)

Create a new Google Sheet and set up the following 9 tabs exactly as described below.
After creating, copy the Sheet ID from the URL (`https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`) and paste it into each n8n workflow's configuration.

---

### Tab 1: Thực đơn

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Ngày | Date | Format: DD/MM/YYYY |
| B | Nội dung | Text | Raw menu content entered by bán trú staff |
| C | Người nhập | Text | Name of person who entered the data |
| D | Bản website | Text | AI-generated HTML draft for website |
| E | Bản Zalo | Text | AI-generated plain text for Zalo |
| F | Bản Facebook | Text | AI-generated copy with hashtags |
| G | Duyệt | Checkbox | ☐ Unchecked by default. Toggling triggers approval timestamp. |
| H | Người duyệt | Text | Auto-filled by Apps Script when G is checked |
| I | Thời điểm duyệt | DateTime | Auto-filled by Apps Script when G is checked |
| J | Đã đăng | Checkbox | ☐ Set to TRUE by n8n after publishing |
| K | URL bài đăng | URL | Post URL written back by n8n after publishing |
| L | Ghi chú | Text | Notes / AI agent flags |

**Data Validation:**
- Column A: Date format DD/MM/YYYY
- Column G, J: Checkbox
- Protect columns D–F, H–K (only n8n/Apps Script should write to these)

---

### Tab 2: Thông báo

Same column structure as Tab 1 (Thực đơn). Column B is "Nội dung thông báo" instead of menu content.

---

### Tab 3: Lịch/TKB

Same column structure as Tab 1 (Thực đơn). Column B is "Nội dung lịch/thời khoá biểu".

---

### Tab 4: FAQ

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Câu hỏi | Text | The question |
| B | Trả lời | Text | The answer |
| C | Danh mục | Text | Category (e.g., Tuyển sinh, Học phí, Bán trú) |
| D | Ngày cập nhật | Date | Last updated date |
| E | Nguồn | Text | Source of the answer (who provided it) |
| F | Trạng thái | Dropdown | Đang dùng / Cần cập nhật / Ngừng sử dụng |

**Data Validation:**
- Column F: Dropdown with values: Đang dùng, Cần cập nhật, Ngừng sử dụng

---

### Tab 5: Compliance

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Campus | Text | e.g., "Victoria Thăng Long 3" |
| B | Nội dung kiểm tra | Text | Description of what is being checked |
| C | Điều khoản | Text | Reference to TT 09/2024 article |
| D | URL kiểm tra | URL | The URL to check |
| E | Từ khoá kỳ vọng | Text | Expected keyword in the page body |
| F | Trạng thái | Text | PASS / FAIL / ERROR (written by n8n) |
| G | HTTP Status | Number | HTTP status code (written by n8n) |
| H | Lần kiểm tra cuối | DateTime | Last check timestamp (written by n8n) |
| I | Ghi chú | Text | Error details or AI-generated notes |

**Setup for TL3 pilot:**
Pre-populate rows with the required URLs from TT 09/2024 Chương II requirements.
Leave other campus rows visible but empty (this becomes the Phase 2 argument).

---

### Tab 6: System Health (Optional)

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Timestamp | DateTime | When the health check ran |
| B | Workflow | Text | Workflow name |
| C | Status | Text | OK / WARNING / ERROR |
| D | Last Run | DateTime | Last successful execution |
| E | Details | Text | AI-generated summary |

This tab is written to by the Master Orchestrator workflow.

---

### Tab 7: Features

Required by `workflow-f-feature-tracker.json`, which appends to a tab of this name.
This tab was missing from the original template.

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Ngày tạo | Date | Date the request was recorded |
| B | Tên tính năng | Text | Short title |
| C | Mô tả | Text | Detail |
| D | Ưu tiên | Dropdown | low / medium / high |
| E | Người yêu cầu | Text | Defaults to `dashboard` |
| F | Trạng thái | Dropdown | Chờ xử lý / Đang làm / Xong |

---

### Tab 8: Config

Not in the original design. Added because n8n custom variables (`$vars`) are a paid feature and
are unavailable on the free self-hosted Community edition, so the runtime values the workflows
need have to live somewhere the workflows can read.

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Key | Text | e.g. `ADMIN_EMAIL` |
| B | Value | Text | e.g. `admin@victoria.edu.vn` |
| C | Used by | Text | Which workflows read it |
| D | Notes | Text | Free text |

Seed rows: `CMS_TYPE`, `WORDPRESS_URL`, `BAN_TRU_EMAIL`, `HIEU_TRUONG_EMAIL`, `POSTER_EMAIL`,
`ADMIN_EMAIL`, `BGD_EMAIL`, `SMTP_FROM`.

Every workflow reads this tab through a `Read Config Sheet` node followed by a `Read Config` code
node, so expressions elsewhere can say `$('Read Config').first().json.ADMIN_EMAIL`.

Keeping these in the Sheet has a second benefit worth stating to the school: staff can change who
receives an escalation email without anyone opening n8n.

---

### Tab 9: Audit Log

Not in the original design. Added because "traceability" (Level 4 of the compliance framework)
promises a record of what was published, when, and by whom — and no such record currently exists.
The Apps Script stamps approval only, and it is overwritten if the checkbox is unticked and
re-ticked.

Append-only. Workflow D writes one row per publish.

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Timestamp | DateTime | When the publish happened |
| B | Tab | Text | Source tab (Thực đơn / Thông báo / Lịch-TKB) |
| C | Row | Number | Source row number |
| D | Content date | Date | The Ngày value of the published row |
| E | Approved by | Text | Copied from the source row (Người duyệt) |
| F | Approved at | DateTime | Copied from the source row (Thời điểm duyệt) |
| G | Method | Text | WordPress API / Email to poster |
| H | Post URL | URL | Where it was published |
| I | Result | Text | SUCCESS / FAILED |

Protect the whole tab against editing. Its value is that nobody can change it after the fact.

---

### Cập nhật B5 (05/10/2026): nhiều mục nội dung, nhân sự, nhiều cơ sở

**Mỗi cơ sở một bảng tính** với cùng cấu trúc; `infra/campuses.json` liệt kê các bảng tính
(`node scripts/build-workflows.mjs` tạo bộ workflow riêng cho từng cơ sở).

**Các tab nội dung** (`Thực đơn`, `Thông báo`, `Lịch/TKB`, `Tin hoạt động`) dùng chung cột A–L như
Tab 1, thêm cột **M `Đã báo Zalo`** (workflow Z ghi thời điểm đã gửi bản nháp cho người duyệt).
Tab nào được dùng do khoá `CONTENT_TABS` quyết định. Mã dùng trong Zalo: `td`, `tb`, `lich`, `tin`.

**Tab `Nhân sự`** (Z, E, I đọc; người không có trong tab này không được hệ thống trả lời):

| Cột | Ý nghĩa |
|---|---|
| Họ tên | Tên hiển thị |
| Zalo ID / Zalo chat ID | Lấy từ dòng "người lạ" trong System Health khi người đó nhắn bot lần đầu |
| Email | Địa chỉ dùng để gửi email cho hộp thư tiếp nhận và nhận nhắc việc |
| Vai trò | `Nhập liệu`, `Duyệt` hoặc `Quản trị` |
| Cơ sở | Ghi chú |
| Loại nội dung | Danh sách tab phụ trách, cách nhau dấu phẩy; để trống = tất cả |
| Kênh nhận | `Zalo`, `Email` hoặc `Cả hai`; để trống = Email nếu có, không thì Zalo |
| Nhắc việc | `Không` để tắt nhắc; để trống = có |
| Đang dùng | `Không`/`Ngừng` để khoá người này |

**Khoá Config bổ sung** (thiếu khoá bắt buộc thì workflow dừng và workflow H báo lỗi):

| Khoá | Bắt buộc | Dùng bởi | Ví dụ |
|---|---|---|---|
| `SCHOOL_NAME` | C | C, E, G, Master | Trường TH & THCS Victoria Thăng Long 3 |
| `HASHTAGS` | | C | #VictoriaThangLong3 |
| `CONTENT_TABS` | | C, D, Z, I | Thực đơn, Thông báo, Lịch/TKB, Tin hoạt động |
| `OLLAMA_MODEL` | | C | qwen2.5:7b |
| `DRAFT_BATCH_LIMIT` | | C | 3 (số hàng soạn mỗi 2 phút) |
| `WP_CATEGORIES` | | D | Thực đơn=12; Thông báo=5 |
| `EXPECTED_WORKFLOWS` | Master | Master | in ra bởi build-workflows.mjs |
| `CMS_TYPE`, `SMTP_FROM`, `ADMIN_EMAIL`, `POSTER_EMAIL` | D | D | `wordpress` hoặc `manual` |
| `HIEU_TRUONG_EMAIL` | E | E | |
| `BAN_TRU_EMAIL` | | E | dự phòng khi tab Nhân sự chưa có ai |
| `ZALO_BOT_NAME` | | Z | tên bot để bỏ @nhắc trong nhóm |

**Lệnh Zalo**: `thực đơn 06/10: …`, `lịch 07/10: …`, `thông báo: …`, `tin: …`,
`duyệt tb 12`, `trả lại lich 5 <lý do>` (`duyệt 12` = thực đơn), `trợ giúp`.

**Email tới hộp thư tiếp nhận** (workflow I, tiêu đề bắt đầu bằng): `[Thực đơn 06/10]`, `[Thông báo]`,
`[Lịch 07/10]`, `[Tin]` — nội dung trong thân thư; `[Tóm tắt]` — đính kèm 1 file PDF, hệ thống trả lời
bản tóm tắt cho chính người gửi. Nội dung có số điện thoại bị giữ lại.

**Thông tin xác thực mới**: `IMAP` (hộp thư tiếp nhận của trường) và `Header Auth` cho webhook
workflow F. Ollama: `http://winhost:11434`.

**Tài khoản Google cá nhân**: Apps Script không đọc được email người tick ô Duyệt, nên cột Người
duyệt ghi "không xác định (xem lịch sử phiên bản)". Duyệt qua Zalo ghi rõ tên người duyệt.

---

### Version 2

## Victoria TL3 — Bảng Dữ Liệu Trung Tâm (Google Sheet Template)

Create a new Google Sheet and set up the following 5 tabs exactly as described below.
After creating, copy the Sheet ID from the URL (`https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`) and paste it into each n8n workflow's configuration.

---

### Tab 1: Thực đơn

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Ngày | Date | Format: DD/MM/YYYY |
| B | Nội dung | Text | Raw menu content entered by bán trú staff |
| C | Người nhập | Text | Name of person who entered the data |
| D | Bản website | Text | AI-generated HTML draft for website |
| E | Bản Zalo | Text | AI-generated plain text for Zalo |
| F | Bản Facebook | Text | AI-generated copy with hashtags |
| G | Duyệt | Checkbox | ☐ Unchecked by default. Toggling triggers approval timestamp. |
| H | Người duyệt | Text | Auto-filled by Apps Script when G is checked |
| I | Thời điểm duyệt | DateTime | Auto-filled by Apps Script when G is checked |
| J | Đã đăng | Checkbox | ☐ Set to TRUE by n8n after publishing |
| K | URL bài đăng | URL | Post URL written back by n8n after publishing |
| L | Ghi chú | Text | Notes / AI agent flags |

**Data Validation:**
- Column A: Date format DD/MM/YYYY
- Column G, J: Checkbox
- Protect columns D–F, H–K (only n8n/Apps Script should write to these)

---

### Tab 2: Thông báo

Same column structure as Tab 1 (Thực đơn). Column B is "Nội dung thông báo" instead of menu content.

---

### Tab 3: Lịch/TKB

Same column structure as Tab 1 (Thực đơn). Column B is "Nội dung lịch/thời khoá biểu".

---

### Tab 4: FAQ

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Câu hỏi | Text | The question |
| B | Trả lời | Text | The answer |
| C | Danh mục | Text | Category (e.g., Tuyển sinh, Học phí, Bán trú) |
| D | Ngày cập nhật | Date | Last updated date |
| E | Nguồn | Text | Source of the answer (who provided it) |
| F | Trạng thái | Dropdown | Đang dùng / Cần cập nhật / Ngừng sử dụng |

**Data Validation:**
- Column F: Dropdown with values: Đang dùng, Cần cập nhật, Ngừng sử dụng

---

### Tab 5: Compliance

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Campus | Text | e.g., "Victoria Thăng Long 3" |
| B | Nội dung kiểm tra | Text | Description of what is being checked |
| C | Điều khoản | Text | Reference to TT 09/2024 article |
| D | URL kiểm tra | URL | The URL to check |
| E | Từ khoá kỳ vọng | Text | Expected keyword in the page body |
| F | Trạng thái | Text | PASS / FAIL / ERROR (written by n8n) |
| G | HTTP Status | Number | HTTP status code (written by n8n) |
| H | Lần kiểm tra cuối | DateTime | Last check timestamp (written by n8n) |
| I | Ghi chú | Text | Error details or AI-generated notes |

**Setup for TL3 pilot:**
Pre-populate rows with the required URLs from TT 09/2024 Chương II requirements.
Leave other campus rows visible but empty (this becomes the Phase 2 argument).

---

### Tab 6: System Health (Optional)

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Timestamp | DateTime | When the health check ran |
| B | Workflow | Text | Workflow name |
| C | Status | Text | OK / WARNING / ERROR |
| D | Last Run | DateTime | Last successful execution |
| E | Details | Text | AI-generated summary |

This tab is written to by the Master Orchestrator workflow.

---

<a id="sheet-template-en"></a>

## Victoria TL3 Sheet template (EN)

## Victoria TL3 — Central Data Sheet (Google Sheet template, English)

Create a new Google Sheet and set up the following tabs exactly as described.
After creating it, copy the Sheet ID from the URL
(`https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`) and paste it into each n8n workflow.

If you are converting an existing Vietnamese sheet, use
the [rename map](#sheet-rename-map) rather than rebuilding from scratch.

---

### Tab 1: Menu

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Date | Date | Format: DD/MM/YYYY |
| B | Content | Text | Raw menu content entered by boarding-meals staff |
| C | Submitted by | Text | Name of the person who entered the data |
| D | Website version | Text | AI-generated HTML draft for the website |
| E | Zalo version | Text | AI-generated plain text for Zalo |
| F | Facebook version | Text | AI-generated copy with hashtags |
| G | Approved | Checkbox | Unchecked by default. Toggling triggers the approval timestamp. |
| H | Approved by | Text | Auto-filled by Apps Script when G is checked |
| I | Approved at | DateTime | Auto-filled by Apps Script when G is checked |
| J | Published | Checkbox | Set to TRUE by n8n after publishing |
| K | Post URL | URL | Post URL written back by n8n after publishing |
| L | Notes | Text | Notes / AI agent flags |

**Data validation**
- Column A: date format DD/MM/YYYY
- Columns G, J: checkbox
- Protect columns D–F and H–K (only n8n and Apps Script should write to these)

---

### Tab 2: Announcements

Same column structure as Tab 1. Column B holds announcement text instead of menu content.

---

### Tab 3: Schedule

Same column structure as Tab 1. Column B holds the timetable or activity calendar content.

---

### Tab 4: FAQ

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Question | Text | The question |
| B | Answer | Text | The answer |
| C | Category | Text | e.g. Admissions, Fees, Boarding meals |
| D | Last updated | Date | Last updated date |
| E | Source | Text | Who provided the answer |
| F | Status | Dropdown | In use / Needs update / Retired |

**Data validation** — Column F: dropdown with values `In use`, `Needs update`, `Retired`

---

### Tab 5: Compliance

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Campus | Text | e.g. "Victoria Thang Long 3" |
| B | Check item | Text | Description of what is being checked |
| C | Clause | Text | Reference to the Circular 09/2024 article |
| D | Check URL | URL | The URL to check |
| E | Expected keyword | Text | Expected keyword in the page body |
| F | Status | Text | PASS / FAIL / ERROR (written by n8n) |
| G | HTTP Status | Number | HTTP status code (written by n8n) |
| H | Last checked | DateTime | Last check timestamp (written by n8n) |
| I | Notes | Text | Error details or AI-generated notes |

**Setup for the TL3 pilot** — pre-populate rows with the URLs required by Chapter II of
Circular 09/2024. Leave the other campuses' rows visible but empty; that empty table is the
Phase 2 argument.

---

### Tab 6: System Health

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Timestamp | DateTime | When the health check ran |
| B | Workflow | Text | Workflow name |
| C | Status | Text | OK / WARNING / ERROR |
| D | Last Run | DateTime | Last successful execution |
| E | Details | Text | AI-generated summary |

Written to by the Master Orchestrator workflow.

---

### Tab 7: Features

Required by `workflow-f-feature-tracker.json`, which appends to a tab of this name.
This tab was missing from the original template.

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Created | Date | Date the request was recorded |
| B | Feature name | Text | Short title |
| C | Description | Text | Detail |
| D | Priority | Dropdown | Low / Medium / High |
| E | Requested by | Text | Defaults to `dashboard` |
| F | Status | Dropdown | Pending / In progress / Done |

---

### Tab 8: Config

Not in the original design. Added because n8n custom variables (`$vars`) are a paid feature and
are unavailable on the free self-hosted Community edition, so the seven runtime values the
workflows need have to live somewhere the workflows can read.

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Key | Text | e.g. `ADMIN_EMAIL` |
| B | Value | Text | e.g. `admin@victoria.edu.vn` |
| C | Used by | Text | Which workflows read it |
| D | Notes | Text | Free text |

Seed rows: `CMS_TYPE`, `WORDPRESS_URL`, `BAN_TRU_EMAIL`, `HIEU_TRUONG_EMAIL`, `POSTER_EMAIL`,
`ADMIN_EMAIL`, `BGD_EMAIL`.

Keeping these in the Sheet has a second benefit worth stating to the school: staff can change who
receives an escalation email without anyone opening n8n.

---

### Tab 9: Audit Log

Not in the original design. Added because "traceability" (Level 4 of the compliance framework)
promises a record of what was published, when, and by whom — and no such record currently exists.
The Apps Script stamps approval only, and it is overwritten if the checkbox is unticked and
re-ticked.

Append-only. Workflow D should write one row per publish.

| Column | Header | Type | Notes |
|--------|--------|------|-------|
| A | Timestamp | DateTime | When the publish happened |
| B | Tab | Text | Source tab (Menu / Announcements / Schedule) |
| C | Row | Number | Source row number |
| D | Content date | Date | The Date value of the published row |
| E | Approved by | Text | Copied from the source row |
| F | Approved at | DateTime | Copied from the source row |
| G | Method | Text | WordPress API / Email to poster |
| H | Post URL | URL | Where it was published |
| I | Result | Text | SUCCESS / FAILED |

Protect the whole tab against editing. Its value is that nobody can change it after the fact.

---

<a id="sheet-rename-map"></a>

## SHEET-RENAME-MAP (VI to EN sheet names)

## Google Sheet rename map — Vietnamese to English

The workflows in `workflows/en/` reference English tab and column names. They will not match your
existing Sheet until you rename it. Apply this map to the Sheet **before** importing the English
workflows, or the Sheets nodes will fail to find their columns.

Keep a copy of the Vietnamese Sheet until the English set has run end-to-end successfully.

### Tabs

| Vietnamese | English |
|---|---|
| Thực đơn | Menu |
| Thông báo | Announcements |
| Lịch/TKB | Schedule |
| FAQ | FAQ |
| Compliance | Compliance |
| System Health | System Health |
| Features | Features *(not yet defined in the template — see audit)* |

### Operational tabs (Menu / Announcements / Schedule)

| Col | Vietnamese | English |
|---|---|---|
| A | Ngày | Date |
| B | Nội dung | Content |
| C | Người nhập | Submitted by |
| D | Bản website | Website version |
| E | Bản Zalo | Zalo version |
| F | Bản Facebook | Facebook version |
| G | Duyệt | Approved |
| H | Người duyệt | Approved by |
| I | Thời điểm duyệt | Approved at |
| J | Đã đăng | Published |
| K | URL bài đăng | Post URL |
| L | Ghi chú | Notes |

### Compliance tab

| Col | Vietnamese | English |
|---|---|---|
| A | Campus | Campus |
| B | Nội dung kiểm tra | Check item |
| C | Điều khoản | Clause |
| D | URL kiểm tra | Check URL |
| E | Từ khoá kỳ vọng | Expected keyword |
| F | Trạng thái | Status |
| G | HTTP Status | HTTP Status |
| H | Lần kiểm tra cuối | Last checked |
| I | Ghi chú | Notes |

### FAQ tab

| Col | Vietnamese | English |
|---|---|---|
| A | Câu hỏi | Question |
| B | Trả lời | Answer |
| C | Danh mục | Category |
| D | Ngày cập nhật | Last updated |
| E | Nguồn | Source |
| F | Trạng thái | Status |

Dropdown values: Đang dùng → In use · Cần cập nhật → Needs update · Ngừng sử dụng → Retired

### Features tab

| Col | Vietnamese | English |
|---|---|---|
| A | Ngày tạo | Created |
| B | Tên tính năng | Feature name |
| C | Mô tả | Description |
| D | Ưu tiên | Priority |
| E | Người yêu cầu | Requested by |
| F | Trạng thái | Status |

Status values: Chờ xử lý → Pending · Đang làm → In progress · Hoàn thành → Done

### Also renamed

- `scripts/en/approval-timestamp.gs` tracks the tabs `Menu`, `Announcements`, `Schedule`.
  Replace the Apps Script in the Sheet when you rename the tabs, or approval stamping stops working.
- Date format stays `DD/MM/YYYY`. The workflow code builds and matches this string directly, so do
  not switch the Sheet to a US date format.
