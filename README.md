# Fintoc Transfer Automation

Automate outbound transfers via the Fintoc API. Amounts exceeding the daily limit (CLP $7,000,000) are automatically split into multi-day pending transactions and executed in daily batches by a Celery worker.

## Features

- **Transfer creation** — create operations from the SPA; amounts above the daily limit are auto-split into N consecutive-day transactions
- **Execution plan preview** — before confirming a multi-day split, see day-by-day amounts, cumulative totals, and remaining balance
- **Celery daily worker** — `celery-beat` triggers `process_daily_pending` at 09:00 CLT; transactions can also be enqueued on-demand via API
- **Task polling** — enqueue pending transactions (`POST /api/tasks/process-pending`) and poll status (`GET /api/tasks/{id}/status`)
- **Webhook ingestion** — `POST /api/webhooks/fintoc` receives Fintoc `transfer.*` events, validates signature, stores in-memory
- **Webhook simulator (dev)** — when `APP_ENV=development`, a Celery Beat task polls Fintoc every 10 s for outbound transfer status changes and POSTs synthetic webhook events to the backend — no public URL or ngrok required
- **Webhook → PGlite sync** — SPA polls `GET /api/webhook-events` every 5 s and updates local transaction/operation statuses in real time
- **RUT validation** — Chilean RUT (holder_id) validated with modulo-11 check digit in both the SPA form and backend Pydantic schema
- **CSV export (SPA)** — "Export CSV" button on the Pending page downloads all succeeded transactions with full operation details
- **CSV export (CLI)** — `docker compose exec backend python -m app.export_csv` dumps succeeded webhook events to stdout or file
- **Counterparty address book** — save, list, and delete counterparties in PGlite
- **Simulate receive transfer** — fund test accounts via `POST /api/simulate/receive-transfer`
- **Simulate split** — preview split plan via `POST /api/simulate/split-transfer`
- **Seed account workflow** — `.windsurf/workflows/seed-account.md` documents how to fund a test account
- **Full setup workflow** — `.windsurf/workflows/setup.md` builds, seeds, and starts the entire stack with a single command

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
│   │   ├── tasks.py                  # process_daily_pending + webhook simulator tasks
│   │   ├── fintoc_client.py          # Fintoc SDK wrapper
│   │   ├── webhooks.py               # Webhook event handler + in-memory store
│   │   ├── transfer_pending.py       # Daily batch executor per account
│   │   ├── schemas.py                # Pydantic models
│   │   ├── jws.py                    # JWS signature generation (RS256)
│   │   ├── data/
│   │   │   └── institutions.json     # 21 Chilean bank IDs
│   │   └── helpers/
│   │       ├── rut.py                # Chilean RUT validation + formatting
│   │       ├── simulate.py           # Multi-day split simulation
│   │       ├── export_csv.py         # CLI: export succeeded events to CSV
│   │       └── webhook_simulator.py  # Dev-only: Celery task polls Fintoc, POSTs events
│   ├── requirements.txt
│   └── Dockerfile
├── docker-compose.yml                # backend, redis, celery-worker, celery-beat
├── .windsurf/workflows/              # Reusable workflows (setup, seed-account)
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
APP_ENV=development
FINTOC_API_KEY=sk_test_...
FINTOC_PRIVATE_KEY_PATH=/path/to/your/fintoc_private.pem
FINTOC_WEBHOOK_SECRET=              # required in production, optional in development
FINTOC_WEBHOOK_URL=                  # your registered webhook URL (production)
```

> **JWS signing**: The corresponding **public key** must be uploaded to the [Fintoc dashboard](https://app.fintoc.com/) under API Settings → JWS Keys. The backend signs every transfer request with the private key; Fintoc verifies the signature using the public key on file.

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

### 5. Webhook status sync

The backend uses `APP_ENV` to determine how transfer status updates are received:

| `APP_ENV` | Behavior |
|-----------|----------|
| `development` | **Webhook simulator** runs as a Celery Beat task every 10 s — polls Fintoc for outbound transfer status changes and POSTs synthetic `transfer.succeeded` / `transfer.failed` events to `POST /api/webhooks/fintoc`. No public URL needed. |
| `production` | Real webhooks via `POST /api/webhooks/fintoc`. Register `FINTOC_WEBHOOK_URL` in the Fintoc dashboard for `transfer.*` events. `FINTOC_WEBHOOK_SECRET` and `FINTOC_API_KEY` are **required** — the server refuses to start without them. |

The SPA polls `GET /api/webhook-events` every 5 seconds and updates PGlite transaction/operation statuses automatically. The Pending page refreshes in real time when changes are detected.

### 6. Export CSV

```bash
# CLI (from backend container)
docker compose exec backend python -m app.helpers.export_csv
docker compose exec backend python -m app.helpers.export_csv -o /tmp/report.csv
docker compose exec backend python -m app.helpers.export_csv --all   # include failed/rejected
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
- **Webhook sync**: backend stores events in-memory; SPA polls every 5 s and updates PGlite
- **Dev webhook simulator**: `APP_ENV=development` enables a Celery Beat task that polls Fintoc and POSTs events to the backend — no ngrok or public URL needed
- **Production guard**: `APP_ENV=production` requires `FINTOC_WEBHOOK_SECRET` and `FINTOC_API_KEY` or the server exits on startup
- **RUT validation**: modulo-11 check digit enforced in SPA (live feedback) and backend (Pydantic field validator)
- **JWS signing**: private key at `FINTOC_PRIVATE_KEY_PATH`, public key must be uploaded to the Fintoc dashboard
- **Simulate flag**: all transfer functions accept `simulate=True` for dry-run testing
- **Idempotency**: UUID v4 per transaction, stored in DB to prevent double-execution
- **CSV export**: available both from the SPA (PGlite query) and CLI (webhook event store)
