# Victoria TL3 — n8n Workflow System (English set)

English translation of the workflow set in the parent directory. Node names, connections and node
types are identical; only Vietnamese text was translated. Sheet tab and column names now use the
English names in [`docs/en/SHEET-RENAME-MAP.md`](../../docs/en/SHEET-RENAME-MAP.md).

**Before importing:** rename your Google Sheet tabs and column headers to match, and replace the
Apps Script with `scripts/en/approval-timestamp.gs`. Nothing here will find its data otherwise.

## Architecture

```
+-------------------------------------------------------------+
|                   MASTER ORCHESTRATOR                        |
|              (runs every 6h, health checks)                  |
+----------+----------+----------+-----------------------------+
|          |          |          |                             |
|  Wf. C   |  Wf. D   |  Wf. E   |         Wf. G               |
| Drafting | Publish  | Reminder |    Compliance Monitor       |
|  Agent   |          |          |                             |
|          |          |          |  Daily check  Weekly report |
+----+-----+----+-----+----+-----+------+----------+-----------+
     |          |          |            |          |
     v          v          v            v          v
+-------------------------------------------------------------+
|              GOOGLE SHEETS (Central Data)                    |
|  Menu | Announcements | Schedule | FAQ | Compliance | Health |
+-------------------------------------------------------------+
     |                                      |
     v                                      v
+----------+  +----------+  +----------+  +----------+
|  Ollama  |  |  Gemini  |  |WordPress |  |  Gmail   |
| (local)  |  |(fallback)|  |  (CMS)   |  | (alerts) |
+----------+  +----------+  +----------+  +----------+
```

## Workflow files

| File | Description | Trigger |
|------|-------------|---------|
| `workflow-c-drafting-agent.json` | AI drafts 3 content variants (web/Zalo/FB) | Sheet row change |
| `workflow-d-auto-publish.json` | Publishes approved content to WordPress or emails for manual posting | Approval checkbox |
| `workflow-e-thursday-reminder.json` | Reminds boarding-meals staff Thursday, escalates to the Principal Friday | Cron: Thu 8AM |
| `workflow-f-feature-tracker.json` | Records feature requests from the dashboard into the Features tab | Webhook |
| `workflow-g-compliance-monitor.json` | Checks compliance URLs daily, weekly report to management | Cron: Daily 6AM + Mon 9AM |
| `workflow-master-orchestrator.json` | Health-checks all workflows, alerts on failures | Cron: Every 6 hours |

## Quick start

### Prerequisites
- Docker + Docker Compose running
- Ollama with a model pulled
- Google Cloud project with Sheets & Gmail APIs enabled

### Step 1 — Pull an Ollama model

```bash
docker exec -it $(docker ps -q -f name=ollama) ollama pull qwen2.5:7b
```

### Step 2 — Create the Google Sheet

Follow [`docs/en/victoria-tl3-sheet-template.md`](../../docs/en/victoria-tl3-sheet-template.md).

Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{THIS_PART}/edit`

### Step 3 — Install the Apps Script

1. Open the Google Sheet -> Extensions -> Apps Script
2. Paste the contents of [`scripts/en/approval-timestamp.gs`](../../scripts/en/approval-timestamp.gs)
3. Save and authorize

### Step 4 — Import workflows into n8n

1. Open n8n at `http://localhost:5678`
2. Workflows -> Import from File
3. Import each `.json` file from this directory
4. **Important:** replace `[YOUR_GOOGLE_SHEET_ID]` with your actual Sheet ID. It appears 12 times
   across the set, including inside two email bodies — search the raw JSON, not just the node UI.

### Step 5 — Configure credentials

See [`docs/en/credential-setup-guide.md`](../../docs/en/credential-setup-guide.md).

### Step 6 — Configure runtime values

The original set read these from n8n Variables (`$vars`). **Custom variables are a paid n8n feature
and are not available in the free Community edition.** Add a `Config` tab to the Sheet with
key/value rows and read it at the top of each workflow instead:

| Key | Example value | Used by |
|-----|---------------|---------|
| `CMS_TYPE` | `wordpress` or `manual` | Workflow D |
| `WORDPRESS_URL` | `https://your-school.edu.vn` | Workflow D |
| `BAN_TRU_EMAIL` | `bantru@victoria.edu.vn` | Workflow E |
| `HIEU_TRUONG_EMAIL` | `hieutruong@victoria.edu.vn` | Workflow E |
| `POSTER_EMAIL` | `poster@victoria.edu.vn` | Workflow D |
| `ADMIN_EMAIL` | `admin@victoria.edu.vn` | Workflows D, G, Master |
| `BGD_EMAIL` | `bgd@victoria.edu.vn` | Workflow G |

### Step 7 — Activate workflows

Activate in this order, one at a time, testing each:
1. **Workflow C** (Drafting) — test with a sample row first
2. **Workflow E** (Reminder)
3. **Workflow D** (Publish) — test the approval flow
4. **Workflow G** (Compliance) — add URLs to the Compliance tab first
5. **Master Orchestrator** — activate last

## Testing checklist

- [ ] Add a row to the "Menu" tab -> Workflow C generates 3 drafts
- [ ] Tick the "Approved" checkbox -> Apps Script stamps email + time
- [ ] With Approved = TRUE -> Workflow D attempts publish or sends email
- [ ] Manually trigger Workflow E -> verify the email is sent for missing menus
- [ ] Add test URLs to the Compliance tab -> Workflow G checks them
- [ ] Manually trigger the Master Orchestrator -> verify the health check runs
- [ ] Stop Ollama -> verify the Gemini fallback works in Workflow C

## Important notes

- **All workflows start inactive.** Activate one at a time after testing.
- **Timezone:** the compose file sets no timezone, so cron expressions do not evaluate in ICT.
  Set `GENERIC_TIMEZONE: Asia/Ho_Chi_Minh` and `TZ: Asia/Ho_Chi_Minh` on the n8n service.
- **Ollama URL:** uses `http://ollama:11434` (Docker internal network). If n8n is not on the same
  Docker network, use `http://localhost:11434`.
- **n8n API key:** the Master Orchestrator needs one. Create it in n8n: Settings -> API.
- **Known defects:** this set is a faithful translation and reproduces the bugs found in the audit
  (loop wiring in G, missing match columns on the Sheet update nodes, duplicate execution in the
  orchestrator). Fix those before activating.

## Cost

Everything is free-tier: Ollama local, Gemini free tier as backup, Google Sheets, Gmail,
self-hosted n8n.
