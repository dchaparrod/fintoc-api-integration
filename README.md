# Fintoc Transfer Automation

Automate outbound transfers via the Fintoc API. Amounts exceeding the daily limit (CLP $7,000,000) are automatically split into multi-day pending transactions and executed in daily batches.

## Architecture

```
┌─────────────────────────────────────────────┐
│  React SPA (Vite + Tailwind + shadcn/ui)    │
│  ┌───────────────┐  ┌────────────────────┐  │
│  │ Transfer Form  │  │  /pending View     │  │
│  │ (create ops)   │  │  (ops + txns)      │  │
│  └───────┬───────┘  └────────┬───────────┘  │
│          │     PGlite (WASM Postgres)        │
│          │  ┌──────────────────────────────┐ │
│          └──│ clients, counterparties,     │ │
│             │ transfer_operations, txns    │ │
│             └──────────────────────────────┘ │
└──────────────────┬──────────────────────────┘
                   │ HTTP (localhost:8000)
┌──────────────────▼──────────────────────────┐
│  Python Service (FastAPI)                    │
│  - Fintoc SDK transfers + JWS signing        │
│  - simulate module (dry-run test)            │
│  - transfer_pending (daily batch executor)   │
│  (→ becomes Celery worker on ECS later)      │
└──────────────────────────────────────────────┘
```

## Repository Structure

```
fintoc-api-integration/
├── spa/                            # React SPA
│   ├── src/
│   │   ├── components/ui/          # Button, Badge, Card, Input, Label, Select
│   │   ├── db/                     # PGlite init, schema, CRUD queries
│   │   ├── pages/                  # TransferPage, PendingPage
│   │   ├── services/               # API client (calls Python service)
│   │   ├── lib/                    # utils, types
│   │   └── App.tsx                 # Router: / (transfer) + /pending
│   ├── package.json
│   └── vite.config.ts
├── worker/                         # Python service
│   ├── app/
│   │   ├── main.py                 # FastAPI app (/api/transfer, /api/transfer-pending)
│   │   ├── fintoc_client.py        # Fintoc SDK wrapper + error handling
│   │   ├── jws.py                  # JWS signature generation (RS256)
│   │   ├── simulate.py             # Multi-day split simulation (internal/test)
│   │   ├── transfer_pending.py     # Daily batch executor per client
│   │   └── schemas.py              # Pydantic models
│   ├── requirements.txt
│   └── Dockerfile
├── infra/                          # Terraform (CloudFront + ECS + Celery) — TBD
├── WEBHOOKS.md                     # Placeholder for webhook integration
├── .env.example
└── README.md
```

## Quick Start

### SPA (frontend)

```bash
cd spa
npm install
npm run dev          # → http://localhost:5173
```

### Worker (Python service)

```bash
cd worker
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env   # edit with your keys
uvicorn app.main:app --reload --port 8000
```

The SPA proxies `/api/*` requests to `http://localhost:8000` via Vite dev server.

## Database Schema (PGlite — in-browser Postgres)

| Table | Key Columns |
|---|---|
| `clients` | id, name, rut, account_id, daily_limit |
| `client_counterparties` | id, client_id, holder_id, holder_name, account_number, account_type, institution_id |
| `transfer_operations` | id, client_id, client_counterparty_id, total_amount, currency, comment, status |
| `transactions` | id, transfer_operation_id, amount, scheduled_date, status, fintoc_transfer_id, idempotency_key |
| `daily_execution_log` | id, client_id, execution_date, total_executed, status |

## Key Design Decisions

- **Daily limit**: CLP $7,000,000 per client per day (configurable)
- **Splitting**: amounts > daily limit auto-split into N transactions on consecutive days
- **JWS signing**: private key stays server-side only (`private_key.pem`)
- **Simulate flag**: all transfer functions accept `simulate=True` for dry-run testing
- **Idempotency**: UUID v4 per transaction, stored in DB to prevent double-execution
- **PGlite**: Postgres in WASM, persisted to IndexedDB — data survives page reloads
