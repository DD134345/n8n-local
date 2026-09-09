# Victoria TL3 — n8n Workflow System

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                   MASTER ORCHESTRATOR                        │
│              (runs every 6h, health checks)                  │
├──────────┬──────────┬──────────┬──────────────────────────────┤
│          │          │          │                              │
│  Wf. C   │  Wf. D   │  Wf. E   │         Wf. G              │
│ Drafting │ Publish  │ Reminder │    Compliance Monitor        │
│  Agent   │          │          │                              │
│          │          │          │  Daily check  Weekly report  │
└────┬─────┴────┬─────┴────┬─────┴──────┬───────────┬──────────┘
     │          │          │            │           │
     ▼          ▼          ▼            ▼           ▼
┌─────────────────────────────────────────────────────────────┐
│              GOOGLE SHEETS (Central Data)                     │
│  Thực đơn │ Thông báo │ Lịch/TKB │ FAQ │ Compliance │ Health │
└─────────────────────────────────────────────────────────────┘
     │                                      │
     ▼                                      ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  Ollama  │  │  Gemini  │  │WordPress │  │  Gmail   │
│ (local)  │  │(fallback)│  │  (CMS)   │  │ (alerts) │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

## 📦 Workflow Files

| File | Description | Trigger |
|------|-------------|---------|
| `workflow-c-drafting-agent.json` | AI drafts 3 content variants (web/Zalo/FB) | Sheet row change |
| `workflow-d-auto-publish.json` | Publishes approved content to WordPress or emails for manual posting | Approval checkbox |
| `workflow-e-thursday-reminder.json` | Reminds bán trú staff Thursday, escalates to principal Friday | Cron: Thu 8AM |
| `workflow-g-compliance-monitor.json` | Checks compliance URLs daily, weekly report to management | Cron: Daily 6AM + Mon 9AM |
| `workflow-master-orchestrator.json` | Health-checks all workflows, alerts on failures | Cron: Every 6 hours |

## 🚀 Quick Start

### Prerequisites
- Docker + Docker Compose running (you already have this)
- Ollama with a model pulled
- Google Cloud project with Sheets & Gmail APIs enabled

### Step 1: Pull an Ollama Model

```bash
docker exec -it $(docker ps -q -f name=ollama) ollama pull qwen2.5:7b
```

### Step 2: Create the Google Sheet

Follow the template in [`docs/victoria-tl3-sheet-template.md`](../docs/victoria-tl3-sheet-template.md).

Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{THIS_PART}/edit`

### Step 3: Install the Apps Script

1. Open the Google Sheet → Extensions → Apps Script
2. Paste the contents of [`scripts/approval-timestamp.gs`](../scripts/approval-timestamp.gs)
3. Save and authorize

### Step 4: Import Workflows into n8n

1. Open n8n at `http://localhost:5678`
2. Go to **Workflows** → **Import from File**
3. Import each `.json` file from this directory
4. **Important:** After importing each workflow, update:
   - `YOUR_GOOGLE_SHEET_ID` → your actual Sheet ID
   - Credential references → your configured credentials

### Step 5: Configure Credentials in n8n

See the detailed guide: [`docs/credential-setup-guide.md`](../docs/credential-setup-guide.md)

### Step 6: Configure Variables

In n8n, go to **Settings → Variables** and create:

| Variable | Example Value | Used By |
|----------|---------------|---------|
| `CMS_TYPE` | `wordpress` or `manual` | Workflow D |
| `WORDPRESS_URL` | `https://your-school.edu.vn` | Workflow D |
| `BAN_TRU_EMAIL` | `bantru@victoria.edu.vn` | Workflow E |
| `HIEU_TRUONG_EMAIL` | `hieutruong@victoria.edu.vn` | Workflow E |
| `POSTER_EMAIL` | `poster@victoria.edu.vn` | Workflow D |
| `ADMIN_EMAIL` | `admin@victoria.edu.vn` | Workflows D, G, Master |
| `BGD_EMAIL` | `bgd@victoria.edu.vn` | Workflow G |

### Step 7: Activate Workflows

Activate workflows in this order:
1. **Workflow C** (Drafting) — test with a sample row first
2. **Workflow E** (Reminder) — will run next Thursday
3. **Workflow D** (Publish) — test approval flow
4. **Workflow G** (Compliance) — add URLs to Compliance tab first
5. **Master Orchestrator** — activate last

## 🧪 Testing Checklist

- [ ] Add a row to "Thực đơn" tab → Workflow C generates 3 drafts
- [ ] Check the "Duyệt" checkbox → Apps Script stamps email + time
- [ ] With Duyệt = TRUE → Workflow D attempts publish or sends email
- [ ] Manually trigger Workflow E → verify email sent for missing menus
- [ ] Add test URLs to Compliance tab → Workflow G checks them
- [ ] Manually trigger Master Orchestrator → verify health check runs
- [ ] Stop Ollama → verify Gemini fallback works in Workflow C

## ⚠️ Important Notes

- **All workflows start inactive.** Activate them one at a time after testing.
- **Timezone:** Cron expressions assume your server is in ICT (UTC+7). Adjust if different.
- **Ollama URL:** Uses `http://ollama:11434` (Docker internal network). If n8n is not in the same Docker network, use `http://localhost:11434`.
- **n8n API Key:** The Master Orchestrator needs an API key. Create one in n8n: Settings → API → Create API Key.
- **Google Sheet ID:** Replace `YOUR_GOOGLE_SHEET_ID` in every workflow after importing.

## 💰 Cost

Everything is free-tier:
- **Ollama:** Local, free
- **Gemini:** Free tier (backup only)
- **Google Sheets:** Free
- **Gmail:** Free
- **n8n:** Self-hosted, free
