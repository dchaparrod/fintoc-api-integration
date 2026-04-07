# Celery Workers, Webhooks & AWS Deploy

End-to-end plan to add Celery-based daily transaction processing, webhook handling for transfer status updates, and deploy the full stack to AWS ECS/Fargate.

## Current State

- **SPA (PGlite)**: Creates transfer operations, splits into daily transactions, stores locally in browser
- **Backend (FastAPI)**: Executes transfers via Fintoc SDK, has `transfer_pending.py` batch processor and `simulate.py` split simulator
- **Docker**: Single `backend` container with hot-reload, secrets via Docker secrets
- **No task queue**: No Celery, no Redis, no scheduled jobs yet
- **No webhooks**: No endpoint to receive Fintoc transfer status callbacks

---

## Phase 1 — Celery + Redis Setup

### 1.1 Add Redis to `docker-compose.yml`
- Add `redis:7-alpine` service on port `6379`
- Add `CELERY_BROKER_URL=redis://redis:6379/0` env var to backend

### 1.2 Create Celery app (`backend/app/celery_app.py`)
- Initialize Celery with Redis broker
- Configure beat schedule: daily task at a configurable time (e.g. 09:00 CLT)

### 1.3 Create daily task (`backend/app/tasks.py`)
- `process_daily_pending_transactions` task:
  - Receives pending transactions payload from an API trigger or scheduled beat
  - Calls existing `process_pending_transactions()` from `transfer_pending.py`
  - Logs results, returns summary
- Since transactions live in PGlite (browser), the SPA will push pending txns to a backend endpoint that enqueues the Celery task

### 1.4 Add API endpoint to trigger task
- `POST /api/tasks/process-pending` — accepts pending transactions from SPA, enqueues Celery task
- Returns task ID for polling
- `GET /api/tasks/{task_id}/status` — check task result

### 1.5 Add Celery worker + beat to `docker-compose.yml`
- `celery-worker` service: `celery -A app.celery_app worker`
- `celery-beat` service: `celery -A app.celery_app beat`
- Both share same image, env, and secrets as backend

---

## Phase 2 — Simulate Split Operations (E2E Test)

### 2.1 Expose simulation endpoint
- `POST /api/simulate/split-transfer` — accepts a large transfer, returns the split plan (days, amounts, idempotency keys)
- Reuses existing `simulate.py` logic

### 2.2 Simulate execution endpoint
- `POST /api/simulate/execute-plan` — takes a split plan and runs all transactions with `simulate=True`
- Returns per-transaction results

### 2.3 SPA test page or button
- Add a "Simulate Split" button on TransferPage that shows the split plan preview before confirming
- Optionally a dedicated `/simulate` page for testing various amounts

---

## Phase 3 — Webhook for Transfer Status Updates

### 3.1 Backend webhook endpoint
- `POST /api/webhooks/fintoc` — receives Fintoc webhook events
- Validate signature using `WebhookSignature.verify_header()` from the SDK
- Store webhook secret in env: `FINTOC_WEBHOOK_SECRET`
- Parse event type (e.g. `transfer.succeeded`, `transfer.failed`, `transfer.rejected`)

### 3.2 Backend webhook event store
- `GET /api/webhook-events` — returns recent webhook events for the SPA to consume
- Store events in-memory (list) or a simple JSON file — lightweight since PGlite is the source of truth
- Each event: `{id, event_type, transfer_id, status, timestamp, raw_payload}`

### 3.3 SPA polling + PGlite sync
- SPA periodically polls `GET /api/webhook-events?since=<last_seen>`
- Matches `fintoc_transfer_id` in PGlite transactions table
- Updates transaction status locally (`succeeded`, `failed`, `rejected`)
- Updates parent operation status when all transactions resolve

### 3.4 Register webhook in Fintoc dashboard
- Configure webhook URL (will need public URL — use ngrok for dev, ALB for prod)
- Subscribe to `transfer.*` events

---

## Phase 4 — AWS ECS/Fargate Deployment

### 4.1 Infrastructure (Terraform)
Create `infra/` directory with Terraform modules:
- **VPC**: Public + private subnets, NAT gateway
- **ECR**: Container registry for backend image
- **ECS Cluster**: Fargate launch type
- **ECS Services** (3 tasks):
  - `backend` — FastAPI (port 8000), behind ALB
  - `celery-worker` — same image, different command
  - `celery-beat` — same image, beat command
- **ALB**: Application Load Balancer with HTTPS, routes to backend
- **ElastiCache Redis**: Managed Redis for Celery broker
- **Secrets Manager**: Store `FINTOC_API_KEY`, `FINTOC_WEBHOOK_SECRET`, JWS private key
- **CloudWatch Logs**: Log groups for all 3 services

### 4.2 CI/CD
- GitHub Actions workflow:
  - Build Docker image → push to ECR
  - Update ECS service (rolling deploy)
- Environment variables via Secrets Manager / SSM Parameter Store

### 4.3 SPA Deployment
- Build SPA static files (`vite build`)
- Host on S3 + CloudFront (or Netlify/Vercel — simpler)
- Configure API proxy or CORS to point to ALB

### 4.4 Production Postgres (future)
- Noted for later: migrate PGlite transaction data to RDS Postgres
- Backend becomes the single source of truth for operations/transactions
- SPA reads from API instead of local PGlite

---

## Execution Order (Tomorrow)

| # | Task | Est. |
|---|------|------|
| 1 | Redis + Celery app + worker in docker-compose | 30 min |
| 2 | Daily pending task + API trigger endpoint | 30 min |
| 3 | Simulate split endpoint + SPA preview | 30 min |
| 4 | Webhook endpoint + signature validation | 30 min |
| 5 | SPA webhook polling + PGlite sync | 30 min |
| 6 | Terraform infra (VPC, ECS, Redis, ALB) | 60 min |
| 7 | CI/CD pipeline + first deploy | 30 min |
| 8 | SPA deploy (S3/CloudFront or Netlify) | 20 min |
