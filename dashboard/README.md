# Victoria TL3 — Agentic Monitoring Dashboard

Static dashboard (no build step). Monitors n8n workflows, executions, service health, compliance progress, feature requests, health logs.

## Run

```bash
cd dashboard
python -m http.server 8080
```

Open http://localhost:8080

## Configure

1. Enter n8n URL (default `http://localhost:5678`)
2. Enter n8n API key — create at: n8n → Settings → API → Create API Key → `[YOUR_N8N_API_KEY]`
3. Click "Lưu cấu hình" (saved to browser localStorage, never sent anywhere else)

## CORS note

Browser calls to the n8n API may be blocked by CORS. Fix options:

**Option A (simplest):** serve dashboard through the proxy script:

```bash
python proxy.py
```

Opens on http://localhost:8080, proxies `/api/*` to n8n at localhost:5678 — no CORS issue.

**Option B:** put n8n behind nginx/caddy with `Access-Control-Allow-Origin` headers.

## Features

| Section | Data source |
|---------|-------------|
| Health cards | n8n `/healthz`, Ollama `/api/tags`, workflow activity |
| Workflows table | n8n API `/workflows` |
| Executions | n8n API `/executions` (filter by status/workflow) |
| Feature requests | localStorage (export via browser) |
| Health logs | file upload, stored in localStorage (last 20) |
| Compliance | placeholder counts until workflow-g writes real data |
