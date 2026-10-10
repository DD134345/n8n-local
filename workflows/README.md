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
│              GOOGLE SHEETS (Central Data + Config tab)        │
│  Thực đơn │ Thông báo │ Lịch/TKB │ FAQ │ Compliance │ Config │
└─────────────────────────────────────────────────────────────┘
     │                                      │
     ▼                                      ▼
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│  Ollama  │  │  Gemini  │  │WordPress │  │   SMTP   │  │   Zalo   │
│ (on host)│  │(fallback)│  │  (CMS)   │  │ (email)  │  │  (bot)   │
└──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘
```

## 📦 Workflow Files

| File | Description | Trigger |
|------|-------------|---------|
| `workflow-c-drafting-agent.json` | AI drafts 3 content variants (web/Zalo/FB) | Every 2 min (reads the Sheet) |
| `workflow-d-auto-publish.json` | Publishes approved content to WordPress, or emails it for manual posting | Every 2 min (reads the Sheet) |
| `workflow-e-thursday-reminder.json` | Reminds bán trú staff (email or Zalo) on Thursday, escalates to the principal | Cron: Thu 8AM |
| `workflow-f-feature-tracker.json` | Records feature requests into the Features tab | Webhook (header auth) |
| `workflow-g-compliance-monitor.json` | Checks compliance URLs daily, weekly report to management | Cron: Daily 6AM + Mon 9AM |
| `workflow-h-global-error.json` | Catches failures from the other workflows and alerts a person | Error trigger |
| `workflow-i-email-intake.json` | Staff email intake into the right tab, or a PDF summary reply | IMAP mailbox |
| `workflow-master-orchestrator.json` | Health-checks all workflows, alerts on failures | Every 6 hours |
| `workflow-z-zalo-gateway.json` | Staff-only Zalo bot: submit, approve/return drafts, new-draft notices | Every 20 s (getUpdates) + every 2 min |
| `newton/nwt-p-publisher-astro.json` | Publishes approved news to the Astro kindergarten site via GitHub | Every 2 min |

## 🚀 Quick Start

### Prerequisites
- Docker + Docker Compose (the stack in `infra/`, n8n + Postgres)
- Ollama running natively on the host (not in Docker)
- A Google Cloud project with the Sheets and Drive APIs enabled
- School SMTP (and, for Workflow I, IMAP) details from the school's IT provider

### Step 1: Ollama on the host

```bash
ollama pull qwen2.5:7b
```

Set `OLLAMA_HOST=0.0.0.0:11434`, restart Ollama, and allow TCP 11434 in the firewall from the VM
subnet only. n8n reaches it at `http://winhost:11434`.

### Step 2: Create the Google Sheet

Follow the template in [`docs/SETUP.md` (Sheet template, VI)](../docs/SETUP.md#sheet-template-vi),
including the `Config` and `Nhân sự` tabs.

Copy the Sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{THIS_PART}/edit`

### Step 3: Install the Apps Script

1. Open the Google Sheet → Extensions → Apps Script
2. Paste the contents of [`scripts/approval-timestamp.gs`](../scripts/approval-timestamp.gs)
3. Save and authorize
4. Test with each approver's account. Personal Gmail editors may not be identified, and their tick
   is then rejected on purpose.

### Step 4: Configure Credentials in n8n

See [`docs/SETUP.md` (credential setup)](../docs/SETUP.md#credential-setup-guide). Create
them first: the build step in Step 5 needs their IDs.

### Step 5: Build and import the workflows

Don't edit the JSON by hand. Per campus:

1. Copy `infra/campuses.example.json` to `infra/campuses.json`; fill in the Sheet ID and the
   credential IDs.
2. `node scripts/build-workflows.mjs` → writes `infra/import/<CODE>/` with every placeholder filled
   and prints the `EXPECTED_WORKFLOWS` value for the Config tab. It stops if anything is missing.
3. `docker compose exec n8n n8n import:workflow --separate --input=/import/<CODE>`

`newton/` is not processed by the build script: import it from the n8n UI and attach its
credentials by hand.

### Step 6: Fill the Config tab

Runtime values live in the Sheet's `Config` tab, **not** n8n Settings → Variables (custom variables
are a paid feature, not in Community edition). Keys include `CMS_TYPE` (`wordpress` or `manual`),
`WORDPRESS_URL`, `BAN_TRU_EMAIL`, `HIEU_TRUONG_EMAIL`, `POSTER_EMAIL`, `ADMIN_EMAIL`, `BGD_EMAIL`,
`SMTP_FROM`, `EXPECTED_WORKFLOWS`. See Tab 8 in `docs/SETUP.md`.

For Zalo, put `ZALO_BOT_TOKEN_<CODE>=...` in `infra/zalo.env` and run `docker compose up -d` again.

### Step 7: Activate Workflows

Activate workflows in this order, one at a time:
1. **Workflow H** (Global error) — so failures in the others are reported
2. **Workflow C** (Drafting) — test with a sample row first
3. **Workflow E** (Reminder) — will run next Thursday
4. **Workflow D** (Publish) — test approval flow
5. **Workflow G** (Compliance) — add URLs to Compliance tab first
6. **Workflow I / Z** (Email intake / Zalo) — after the staff tab is filled
7. **Master Orchestrator** — activate last

## 🧪 Testing Checklist

- [ ] Add a row to "Thực đơn" tab → Workflow C generates 3 drafts within ~2 minutes
- [ ] Check the "Duyệt" checkbox → Apps Script stamps email + time
- [ ] With Duyệt = TRUE → Workflow D attempts publish or sends email
- [ ] Manually trigger Workflow E → verify email/Zalo sent for missing menus
- [ ] Add test URLs to Compliance tab → Workflow G checks them
- [ ] Manually trigger Master Orchestrator → verify health check runs
- [ ] Stop Ollama → verify Gemini fallback works in Workflow C
- [ ] Break a test workflow on purpose → Workflow H sends an alert

## ⚠️ Important Notes

- **All workflows start inactive.** Activate them one at a time after testing.
- **Timezone:** `infra/compose.yaml` sets `GENERIC_TIMEZONE` and `TZ` to `Asia/Ho_Chi_Minh`, so cron times are ICT.
- **Ollama URL:** `http://winhost:11434` (Ollama on the Windows host; `winhost` = `WIN_HOST_IP` in `infra/.env`).
- **n8n API Key:** The Master Orchestrator needs one: Settings → n8n API → Create an API key.
- **Google OAuth:** publish the consent screen to production, or the Sheets connection expires every 7 days.

## 💰 Cost

Everything is free-tier:
- **Ollama:** Local, free
- **Gemini:** Free tier (backup only)
- **Google Sheets:** Free
- **Email:** the school's own mail server
- **n8n:** Self-hosted Community edition, free
