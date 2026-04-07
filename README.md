# Fintoc Transfer Automation

Automate outbound transfers via the Fintoc API. Amounts exceeding the daily limit (CLP $7,000,000) are automatically split into multi-day pending transactions and executed in daily batches.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  React SPA (Vite + Tailwind + shadcn/ui)        │
│  ┌───────────────┐  ┌────────────────────────┐  │
│  │ Transfer Form  │  │  /pending View         │  │
│  │ (create ops)   │  │  (ops + txns table)    │  │
│  └───────┬───────┘  └────────┬───────────────┘  │
│          │     PGlite (WASM Postgres)            │
│          │  ┌──────────────────────────────────┐ │
│          └──│ transfer_operations, transactions │ │
│             └──────────────────────────────────┘ │
└──────────────────┬──────────────────────────────┘
                   │ HTTP /api/* (proxy → :8000)
┌──────────────────▼──────────────────────────────┐
│  Backend (FastAPI + Celery)                      │
│  ┌─────────────────────────────────────────────┐ │
│  │ GET  /api/accounts        (Fintoc API)      │ │
│  │ GET  /api/counterparties  (Fintoc API)      │ │
│  │ GET  /api/institutions    (hardcoded JSON)   │ │
│  │ POST /api/transfer        (JWS + SDK)       │ │
│  │ POST /api/transfer-pending (daily batch)    │ │
│  └─────────────────────────────────────────────┘ │
│  simulate module (internal test, --simulate)     │
│  (→ Celery worker on ECS for daily execution)    │
└──────────────────────────────────────────────────┘
```

**Accounts and counterparties** are fetched live from the Fintoc API.
Only **operations and transactions** are stored locally (PGlite) to manage the multi-day "big transfer" splitting.

## Repository Structure

```
fintoc-api-integration/
├── spa/                            # React SPA
│   ├── src/
│   │   ├── components/ui/          # Button, Badge, Card, Input, Label, Select
│   │   ├── db/                     # PGlite init, schema, CRUD queries
│   │   ├── pages/                  # TransferPage, PendingPage
│   │   ├── services/               # API client (calls backend)
│   │   ├── lib/                    # utils, types
│   │   └── App.tsx                 # Router: / (transfer) + /pending
│   ├── package.json
│   └── vite.config.ts
├── backend/                        # FastAPI + Celery worker
│   ├── app/
│   │   ├── main.py                 # FastAPI endpoints
│   │   ├── fintoc_client.py        # Fintoc SDK: accounts, counterparties, transfers
│   │   ├── jws.py                  # JWS signature generation (RS256)
│   │   ├── simulate.py             # Multi-day split simulation (internal/test)
│   │   ├── transfer_pending.py     # Daily batch executor per account
│   │   ├── schemas.py              # Pydantic models
│   │   └── institutions.json       # Hardcoded Chilean bank IDs
│   ├── build.sh                    # Docker image build script
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

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Docker

```bash
cd backend
./build.sh
docker run -p 8000:8000 \
  -e FINTOC_API_KEY=sk_test_... \
  -v ~/.ssh/fintoc_private.pem:/app/private_key.pem:ro \
  fintoc-backend
```

The SPA proxies `/api/*` requests to `http://localhost:8000` via Vite dev server.

## Local Storage (PGlite — in-browser Postgres)

Only operations and transactions are stored locally. Accounts and counterparties come from Fintoc API.

| Table | Key Columns |
|---|---|
| `transfer_operations` | id, account_id, account_name, counterparty_*, total_amount, currency, comment, status |
| `transactions` | id, transfer_operation_id, amount, scheduled_date, status, fintoc_transfer_id, idempotency_key |

## Key Design Decisions

- **Accounts & counterparties**: fetched from Fintoc API (not stored locally)
- **Daily limit**: CLP $7,000,000 per account per day (configurable)
- **Splitting**: amounts > daily limit auto-split into N transactions on consecutive days
- **JWS signing**: private key at `~/.ssh/fintoc_private.pem` (server-side only)
- **Simulate flag**: all transfer functions accept `simulate=True` for dry-run testing
- **Idempotency**: UUID v4 per transaction, stored in DB to prevent double-execution
- **Institutions**: 21 Chilean banks hardcoded in `institutions.json`
