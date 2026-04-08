# Fintoc Transfer Automation

Automate outbound transfers via the Fintoc API. Amounts exceeding the daily limit (CLP $7,000,000) are automatically split into multi-day pending transactions and executed in daily batches by a Celery worker.

## Features

- **Transfer creation** — create operations from the SPA; amounts above the daily limit are auto-split into N consecutive-day transactions
- **Execution plan preview** — before confirming a multi-day split, see day-by-day amounts, cumulative totals, and remaining balance
- **Celery daily worker** — `celery-beat` triggers `process_daily_pending` at 09:00 CLT; transactions can also be enqueued on-demand via API
- **Task polling** — enqueue pending transactions (`POST /api/tasks/process-pending`) and poll status (`GET /api/tasks/{id}/status`)
- **Webhook ingestion** — `POST /api/webhooks/fintoc` receives Fintoc `transfer.*` events, validates signature, stores in-memory
- **Webhook → PGlite sync** — SPA polls `GET /api/webhook-events` every 10 s and updates local transaction/operation statuses
- **CSV export (SPA)** — "Export CSV" button on the Pending page downloads all succeeded transactions with full operation details
- **CSV export (CLI)** — `docker compose exec backend python -m app.export_csv` dumps succeeded webhook events to stdout or file
- **Counterparty address book** — save, list, and delete counterparties in PGlite
- **Simulate receive transfer** — fund test accounts via `POST /api/simulate/receive-transfer`
- **Simulate split** — preview split plan via `POST /api/simulate/split-transfer`
- **Seed account workflow** — `.windsurf/workflows/seed-account.md` documents how to fund a test account

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  React SPA  (Vite + Tailwind + PGlite)                   │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │ TransferPage  │ │ PendingPage  │ │CounterpartiesPage│  │
│  │ + exec plan   │ │ + CSV export │ │ + CRUD           │  │
│  └──────┬───────┘ └──────┬───────┘ └────────┬─────────┘  │
│         └────────────────┼──────────────────┘             │
│              PGlite (WASM Postgres in IndexedDB)          │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ saved_counterparties · transfer_operations · txns    │ │
│  └──────────────────────────────────────────────────────┘ │
│         useWebhookSync (polls /api/webhook-events)        │
└─────────────────────┬────────────────────────────────────┘
                      │ HTTP /api/* (Vite proxy → :8000)
┌─────────────────────▼────────────────────────────────────┐
│  Backend  (FastAPI)                                       │
│  GET  /api/accounts · /api/institutions                   │
│  POST /api/transfer · /api/transfer-pending               │
│  POST /api/simulate/receive-transfer                      │
│  POST /api/simulate/split-transfer                        │
│  POST /api/simulate/execution-plan                        │
│  POST /api/tasks/process-pending                          │
│  GET  /api/tasks/{id}/status                              │
│  POST /api/webhooks/fintoc                                │
│  GET  /api/webhook-events                                 │
└─────────────────────┬────────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────────┐
│  Celery Worker + Beat  (Redis broker)                     │
│  process_daily_pending — 09:00 CLT or on-demand           │
└──────────────────────────────────────────────────────────┘
```

## Repository Structure

```
fintoc-api-integration/
├── spa/                              # React SPA (Vite + Tailwind)
│   ├── src/
│   │   ├── components/ui/            # Button, Badge, Card, Input, Label, Select
│   │   ├── db/                       # PGlite init, schema, CRUD queries
│   │   ├── hooks/                    # useWebhookSync (webhook → PGlite sync)
│   │   ├── lib/                      # utils, types, csv export helpers
│   │   ├── pages/                    # TransferPage, PendingPage, CounterpartiesPage
│   │   ├── services/                 # API client (accounts, tasks, webhooks, exec plan)
│   │   └── App.tsx                   # Router + webhook sync
│   ├── package.json
│   └── vite.config.ts
├── backend/                          # FastAPI + Celery
│   ├── app/
│   │   ├── main.py                   # All API endpoints
│   │   ├── celery_app.py             # Celery config + beat schedule
│   │   ├── tasks.py                  # process_daily_pending task
│   │   ├── fintoc_client.py          # Fintoc SDK wrapper
│   │   ├── webhooks.py               # Webhook event handler + in-memory store
│   │   ├── simulate.py               # Multi-day split simulation
│   │   ├── transfer_pending.py       # Daily batch executor per account
│   │   ├── export_csv.py             # CLI: export succeeded events to CSV
│   │   ├── schemas.py                # Pydantic models
│   │   ├── jws.py                    # JWS signature generation (RS256)
│   │   └── institutions.json         # 21 Chilean bank IDs
│   ├── requirements.txt
│   └── Dockerfile
├── docker-compose.yml                # backend, redis, celery-worker, celery-beat
├── .windsurf/workflows/              # Reusable workflows (seed-account)
├── plans/                            # Implementation plans
├── .env.example
└── README.md
```

## Quick Start

### 1. Environment setup

```bash
cp .env.example .env
```

Add your secrets to `.env`:

```env
FINTOC_API_KEY=sk_test_...
FINTOC_WEBHOOK_SECRET=whsec_...
FINTOC_WEBHOOK_TEST_URL=https://webhook.site/your-unique-id
```

### 2. Backend + Celery + Redis (Docker Compose)

```bash
docker compose build
docker compose up -d
```

This starts **4 containers**: `backend` (:8000), `redis` (:6379), `celery-worker`, `celery-beat`.

```bash
docker compose ps
curl http://localhost:8000/api/health   # → {"status":"ok"}
```

### 3. SPA (frontend)

```bash
cd spa
npm install
npm run dev          # → http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:8000`.

### 4. Seed a test account

```bash
# List accounts
curl -s http://localhost:8000/api/accounts | python3 -m json.tool

# Simulate inbound transfer (replace ACCOUNT_NUMBER_ID)
curl -s -X POST http://localhost:8000/api/simulate/receive-transfer \
  -H "Content-Type: application/json" \
  -d '{"account_number_id": "<ACCOUNT_NUMBER_ID>", "amount": 50000000, "currency": "CLP"}'
```

Or run `/seed-account` in Windsurf. See `.windsurf/workflows/seed-account.md`.

### 5. Webhook testing (dev)

Register your `FINTOC_WEBHOOK_TEST_URL` in the Fintoc dashboard for `transfer.*` events.
For local development, use [webhook.site](https://webhook.site) or ngrok to expose the backend.

### 6. Export CSV

```bash
# CLI (from backend container)
docker compose exec backend python -m app.export_csv
docker compose exec backend python -m app.export_csv -o /tmp/report.csv
docker compose exec backend python -m app.export_csv --all   # include failed/rejected
```

Or click **"Export CSV"** on the Pending page in the SPA.

## Local Storage (PGlite — in-browser Postgres)

Accounts and counterparties come from the Fintoc API. Only the following are stored locally:

| Table | Key Columns |
|---|---|
| `saved_counterparties` | id, holder_id, holder_name, account_number, account_type, institution_id |
| `transfer_operations` | id, account_id, account_name, counterparty_*, total_amount, currency, comment, status |
| `transactions` | id, transfer_operation_id, amount, scheduled_date, status, fintoc_transfer_id, idempotency_key |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/accounts` | List Fintoc accounts |
| GET | `/api/accounts/{id}` | Get single account |
| GET | `/api/institutions` | List Chilean banks |
| POST | `/api/transfer` | Execute single transfer |
| POST | `/api/transfer-pending` | Execute pending batch (sync) |
| POST | `/api/simulate/receive-transfer` | Simulate inbound transfer (test) |
| POST | `/api/simulate/split-transfer` | Preview split plan |
| POST | `/api/simulate/execution-plan` | Full execution plan with cumulative totals |
| POST | `/api/tasks/process-pending` | Enqueue pending txns to Celery |
| GET | `/api/tasks/{id}/status` | Poll Celery task result |
| POST | `/api/webhooks/fintoc` | Receive Fintoc webhook events |
| GET | `/api/webhook-events` | List stored webhook events |

## Key Design Decisions

- **Daily limit**: CLP $7,000,000 per account per day (configurable)
- **Auto-splitting**: amounts above the limit are split into N transactions on consecutive business days
- **Execution plan preview**: users review day-by-day breakdown before confirming a multi-day operation
- **Celery + Redis**: async task processing with daily beat schedule and on-demand enqueue
- **Webhook sync**: backend stores events in-memory; SPA polls every 10 s and updates PGlite
- **JWS signing**: private key at `~/.ssh/fintoc_private.pem`, passed to Fintoc SDK automatically
- **Simulate flag**: all transfer functions accept `simulate=True` for dry-run testing
- **Idempotency**: UUID v4 per transaction, stored in DB to prevent double-execution
- **CSV export**: available both from the SPA (PGlite query) and CLI (webhook event store)
