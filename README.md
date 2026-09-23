# n8n-local

Local n8n automation for a school's website operations, plus the school website it manages.
Staff enter content once in a Google Sheet. n8n drafts it, waits for a human approval, publishes it,
and records the result.

## What's in this repo

| Path | Contents |
|---|---|
| `workflows/` | n8n workflow exports (Vietnamese). `workflows/en/` is the English mirror |
| `scripts/` | Google Apps Script (approval stamp) and the n8n backup script. `scripts/en/` mirrors it |
| `dashboard/` | Static status dashboard + small proxy. `dashboard/en/` mirrors it |
| `n8n-local/` | Docker Compose for n8n + Postgres, and `.env.example` |
| `website/` | Git submodule: the kindergarten website (Astro) |

### Workflows

| File | Purpose |
|---|---|
| `workflow-c-drafting-agent` | Drafts website / Zalo / Facebook versions from a Sheet row (local model, hosted fallback) |
| `workflow-d-auto-publish` | Publishes rows a human approved; records the result |
| `workflow-e-thursday-reminder` | Reminds staff about missing content before the deadline |
| `workflow-f-feature-tracker` | Tracks feature / task status |
| `workflow-g-compliance-monitor` | Checks that required public pages are live and contain the right content |
| `workflow-h-global-error` | Catches failures from other workflows and alerts a person |
| `workflow-master-orchestrator` | Health check: failed runs and workflows that should be active |

## Design rules

- Nothing is published without a human approval.
- No automatic replies to parents; no automatic posting to Zalo or Facebook.
- No student personal data is processed.
- Every failure alerts a person or is visible in the Sheet.

## Quick start

```bash
git clone --recurse-submodules https://github.com/DD134345/n8n-local.git
cd n8n-local/n8n-local
cp .env.example .env        # fill in your own values; never commit .env
docker compose up -d        # n8n on http://localhost:5678
```

Import the files from `workflows/` (or `workflows/en/`) in the n8n editor. All workflows ship
inactive; configure credentials and the Sheet's Config tab first.

Website:

```bash
cd website && npm install && npm run dev
```

## Not in this repo

Project documents, proposals, internal notes and agent/tooling configuration are kept private.
Secrets are never committed. If you find one, please open an issue without quoting it.
