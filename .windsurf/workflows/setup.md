---
description: Build, seed, and start the full Fintoc Transfer Automation stack locally
---

# Local Setup & Seed

Build all services, seed a test account with funds, start the SPA, and display access points.

## Prerequisites

- Docker & Docker Compose installed
- Node.js 20+ installed
- `.env` configured (copy from `.env.example`)
- JWS private key at `FINTOC_PRIVATE_KEY_PATH`

## Steps

1. Verify `.env` exists:
// turbo
```bash
test -f .env && echo "✓ .env found" || echo "✗ .env missing — run: cp .env.example .env"
```

2. Build and start backend, Redis, Celery worker, and Celery beat:
```bash
docker compose up -d --build
```

3. Wait for backend health check:
// turbo
```bash
until curl -sf http://localhost:8000/api/health > /dev/null 2>&1; do sleep 1; done && echo "✓ Backend healthy"
```

4. Verify the webhook simulator started (APP_ENV=development):
// turbo
```bash
docker compose logs backend 2>&1 | grep -E "DEVELOPMENT|WebhookSim" | tail -4
```
Expected: `Starting in DEVELOPMENT mode` and `[WebhookSim] Initial snapshot: N transfers tracked`.

5. List active Fintoc accounts:
// turbo
```bash
curl -s http://localhost:8000/api/accounts | python3 -m json.tool
```
Note the `root_account_number_id` value from the output.

6. Seed the account with CLP $50,000,000 (replace `<ACCOUNT_NUMBER_ID>` with the value from step 5):
```bash
curl -s -X POST http://localhost:8000/api/simulate/receive-transfer \
  -H "Content-Type: application/json" \
  -d '{"account_number_id": "<ACCOUNT_NUMBER_ID>", "amount": 50000000, "currency": "CLP"}' | python3 -m json.tool
```

7. Confirm the balance was credited:
// turbo
```bash
curl -s http://localhost:8000/api/accounts | python3 -c "import sys,json; accs=json.load(sys.stdin); [print(f\"  {a['name'] or a['id']}  balance: {a['balance']:,} {a['currency']}\") for a in accs]"
```

8. Install SPA dependencies and start the dev server:
```bash
cd spa && npm install && npm run dev
```

9. Verify all Docker services are running:
// turbo
```bash
docker compose ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
```

10. Test pending transaction execution (dry-run, no real Fintoc transfer):
```bash
curl -s -X POST 'http://localhost:8000/api/transfer-pending?simulate=true' \
  -H "Content-Type: application/json" \
  -d '[{"account_id":"acc_demo_001","amount":7000000,"currency":"CLP","counterparty":{"holder_id":"771433855","holder_name":"Piped Piper SpA","account_number":"502955923","account_type":"checking_account","institution_id":"cl_banco_de_chile"},"idempotency_key":"test-sim-001","comment":"Simulated Day 1"}]' | python3 -m json.tool
```
Expected: returns `results` array with a simulated transfer response (status, id).

11. Print access summary:
// turbo
```bash
echo ""
echo "═══════════════════════════════════════════════════════"
echo "  Fintoc Transfer Automation — Local Environment"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  URLs"
echo "  ────"
echo "  SPA              http://localhost:5173"
echo "  Backend API      http://localhost:8000"
echo "  FastAPI Docs     http://localhost:8000/docs"
echo "  ReDoc            http://localhost:8000/redoc"
echo "  Redis            localhost:6379"
echo ""
echo "  Docker Services"
echo "  ───────────────"
echo "  fintoc-backend        FastAPI + uvicorn (hot-reload)"
echo "  fintoc-redis          Redis 7 (Celery broker)"
echo "  fintoc-celery-worker  Celery worker"
echo "  fintoc-celery-beat    Celery beat (daily 09:00 CLT)"
echo ""
echo "  Webhook Status Sync"
echo "  ────────────────────"
echo "  APP_ENV=development"
echo "    Webhook simulator polls Fintoc every 10s for outbound"
echo "    transfer status changes and injects synthetic events."
echo "    No public URL or ngrok required."
echo "  APP_ENV=production"
echo "    Real webhooks via POST /api/webhooks/fintoc."
echo "    FINTOC_WEBHOOK_SECRET is required or server exits."
echo ""
echo "  SPA polls GET /api/webhook-events every 5s and updates"
echo "  PGlite transaction statuses automatically."
echo ""
echo "  Try It Out"
echo "  ──────────"
echo "  # Preview a 25M CLP split transfer"
echo "  curl -s -X POST http://localhost:8000/api/simulate/split-transfer \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"total_amount\": 25000000, \"counterparty_name\": \"Test\"}' | python3 -m json.tool"
echo ""
echo "  # Full execution plan with idempotency keys"
echo "  curl -s -X POST http://localhost:8000/api/simulate/execution-plan \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"total_amount\": 25000000, \"counterparty_name\": \"Test\", \"account_id\": \"acc_demo_001\"}' | python3 -m json.tool"
echo ""
echo "  # Interactive API docs (try any endpoint)"
echo "  open http://localhost:8000/docs"
echo ""
echo "  Useful Commands"
echo "  ───────────────"
echo "  docker compose logs -f backend        Follow backend logs"
echo "  docker compose logs -f celery-worker  Follow worker logs"
echo "  docker compose exec backend python -m app.helpers.export_csv  Export CSV"
echo "  docker compose restart backend        Restart backend"
echo "  docker compose down                   Stop all services"
echo ""
echo "  PGlite IndexedDB Models (browser)"
echo "  ──────────────────────────────────"
echo "  saved_counterparties"
echo "    id | holder_id (RUT validated) | holder_name"
echo "    account_number | account_type | institution_id | created_at"
echo ""
echo "  transfer_operations"
echo "    id | account_id | account_name"
echo "    counterparty_holder_id | counterparty_holder_name"
echo "    counterparty_account_number | counterparty_account_type"
echo "    counterparty_institution_id"
echo "    total_amount | currency | comment | description"
echo "    status (pending | in_progress | completed | failed)"
echo "    created_at"
echo ""
echo "  transactions"
echo "    id | transfer_operation_id | amount | scheduled_date"
echo "    status (pending | succeeded | failed | rejected"
echo "            | returned | return_pending)"
echo "    fintoc_transfer_id | idempotency_key | created_at"
echo ""
echo "═══════════════════════════════════════════════════════"
```
