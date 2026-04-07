# Fintoc Transfer Automation SPA

Full-stack automation platform: React SPA with in-browser Postgres (PGlite) for the UI/data layer, and a Python service for Fintoc API integration (JWS signing + SDK transfers) that later becomes a Celery worker on ECS.

---

## Architecture Overview

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
                   │ HTTP (localhost)
┌──────────────────▼──────────────────────────┐
│  Python Service (FastAPI)                    │
│  - Fintoc SDK transfers + JWS signing        │
│  - simulate_split() → plan multi-day txns    │
│  - transfer_pending() → execute daily batch  │
│  (→ becomes Celery worker on ECS later)      │
└──────────────────────────────────────────────┘
```

> **Why a Python service?** JWS signing requires the private key (`private_key.pem`). This cannot safely live in the browser. The Python service handles all Fintoc API calls.

---

## Database Schema (PGlite — in-browser Postgres)

| Table | Columns | Purpose |
|---|---|---|
| **clients** | `id (serial PK)`, `name`, `rut`, `daily_limit` (default 7000000) | Registered clients |
| **client_counterparties** | `id (serial PK)`, `client_id (FK)`, `holder_id`, `holder_name`, `account_number`, `account_type`, `institution_id` | Destination bank accounts |
| **transfer_operations** | `id (serial PK)`, `client_id (FK)`, `client_counterparty_id (FK)`, `total_amount`, `currency` (default 'CLP'), `comment`, `description`, `account_id`, `created_at`, `status` (pending/in_progress/completed/failed) | High-level transfer requests |
| **transactions** | `id (serial PK)`, `transfer_operation_id (FK)`, `amount`, `scheduled_date`, `status` (pending/processing/succeeded/failed/rejected), `fintoc_transfer_id`, `idempotency_key`, `created_at` | Individual daily transfer chunks |
| **daily_execution_log** | `id (serial PK)`, `client_id (FK)`, `execution_date`, `total_executed`, `status` | Tracks daily limit consumption per client |

### Splitting Logic
- When `total_amount > daily_limit` (7M CLP): split into N transactions of ≤ 7M each, each assigned to consecutive `scheduled_date` values.
- Per client, only one batch of ≤ 7M executes per day across all their operations.

---

## Implementation Steps

### Phase 1: Project Scaffolding
1. **React SPA** (`spa/`): Vite + React + TypeScript + TailwindCSS + shadcn/ui + PGlite
2. **Python Service** (`worker/`): FastAPI + `fintoc` SDK + `cryptography` (JWS) + `uvicorn`
3. Dependency files: `package.json`, `requirements.txt`, `.env.example`

### Phase 2: PGlite Database Layer (SPA)
4. Initialize PGlite on app load, create schema, persist to IndexedDB
5. Build `db/` module with typed CRUD helpers for all tables
6. Seed sample data (2-3 clients, counterparties) for development

### Phase 3: SPA Views & Forms
7. **`/` (Home/Transfer)**: Form to select client → counterparty → amount → comment → submit
   - On submit: create `transfer_operation` + split into `transactions` if needed
   - Show toast with operation summary (single tx vs. N-day split)
8. **`/pending`**: Table view of all operations + nested transactions
   - Filters by client, status, date range
   - Color-coded status badges
   - Expandable rows to see individual transactions per operation
9. **`/clients`** (optional/stretch): CRUD for clients and counterparties

### Phase 4: Python Fintoc Integration
10. **`/api/transfer`** endpoint: receives transfer payload → JWS sign → call Fintoc SDK → return response
    - Proper HTTP error handling (4xx, 5xx, timeouts)
    - Idempotency key generation (UUID per transaction)
11. **JWS signing module**: `generate_jws_signature_header(raw_body)` using the provided code + `private_key.pem`
12. **`/api/simulate`** endpoint: accepts a list of large operations → returns the multi-day split plan (no execution)
13. **`/api/transfer-pending`** endpoint: for each client, find today's pending transactions, execute up to daily limit, update status
    - This is the function the Celery worker will call on a daily schedule

### Phase 5: SPA ↔ Python Integration
14. SPA calls Python service to execute transfers (via `fetch`)
15. "Run Pending Transfers" button in `/pending` view → calls `/api/transfer-pending`
16. Optional: simple interval/cron trigger in the SPA that auto-calls the pending endpoint (simulates daily execution for dev)

### Phase 6: Terraform & Deployment (later)
17. `infra/`: Terraform modules for:
    - CloudFront + S3 for SPA static hosting
    - ECS Fargate for Python service
    - Celery worker (same ECS service, different entrypoint) + SQS/Redis broker
    - Secrets Manager for `private_key.pem` + Fintoc API key
18. Celery beat schedule: daily task → `transfer_pending()`

### Placeholder: Webhooks
19. Empty section/module documenting future webhook integration for `transfer.outbound.succeeded`, `transfer.outbound.rejected`, `transfer.outbound.failed`

---

## File Structure

```
fintoc-api-integration/
├── spa/                          # React SPA
│   ├── src/
│   │   ├── components/           # UI components (shadcn/ui)
│   │   ├── db/                   # PGlite init, schema, CRUD
│   │   ├── pages/                # Home, Pending, Clients
│   │   ├── services/             # API client (calls Python service)
│   │   ├── lib/                  # utils, types
│   │   └── App.tsx
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.ts
├── worker/                       # Python service
│   ├── app/
│   │   ├── main.py               # FastAPI app
│   │   ├── fintoc_client.py      # Fintoc SDK wrapper
│   │   ├── jws.py                # JWS signing
│   │   ├── simulate.py           # Split simulation logic
│   │   ├── transfer_pending.py   # Daily batch executor
│   │   └── schemas.py            # Pydantic models
│   ├── private_key.pem           # (gitignored)
│   ├── requirements.txt
│   └── Dockerfile
├── infra/                        # Terraform (Phase 6)
│   └── ...
├── WEBHOOKS.md                   # Placeholder for webhook integration
├── .env.example
└── README.md
```

---

## Key Decisions & Notes

- **Daily limit**: 7,000,000 CLP per client per day (configurable in `clients.daily_limit`)
- **Currency**: CLP (integers, no decimals per Fintoc docs)
- **Fintoc SDK** (Python) preferred over raw HTTP for transfers
- **PGlite** persists to IndexedDB — data survives page reloads
- **Private key** never touches the browser — all signing happens server-side
- **Idempotency keys**: UUID v4 per transaction, stored in DB to prevent double-execution
- **account_id**: will be configured per-client or as a global env var (needs clarification from you)
