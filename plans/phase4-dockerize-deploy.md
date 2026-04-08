# Phase 4 — Dockerize Frontend + AWS Deployment

Full-stack containerization and AWS deployment plan for the Fintoc Transfer Automation platform.

## Prerequisites

- Phases 1–3 complete (Celery, webhooks, execution plan, CSV export)
- AWS account with appropriate permissions
- Domain name (optional, for HTTPS)

---

## 4.1 Dockerize SPA

### Dockerfile (`spa/Dockerfile`)
```dockerfile
# Build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

### Nginx config (`spa/nginx.conf`)
- Serve static files from `/usr/share/nginx/html`
- Proxy `/api/*` to `http://backend:8000`
- SPA fallback: all non-file routes → `index.html`

### docker-compose.yml
Add `spa` service:
```yaml
spa:
  build:
    context: ./spa
    dockerfile: Dockerfile
  container_name: fintoc-spa
  ports:
    - "3000:80"
  depends_on:
    - backend
```

### Result
`docker compose up -d` starts **5 containers**: spa (:3000), backend (:8000), redis, celery-worker, celery-beat.

---

## 4.2 Infrastructure (Terraform)

Create `infra/` directory with modules:

### Networking
- **VPC**: 2 public + 2 private subnets across 2 AZs
- **NAT Gateway**: for private subnet outbound traffic
- **Security Groups**: ALB (80/443), ECS tasks (8000, 80), Redis (6379)

### Container Registry
- **ECR**: Two repositories — `fintoc-backend`, `fintoc-spa`

### Compute
- **ECS Cluster**: Fargate launch type
- **ECS Services** (4 tasks, all Fargate):

| Service | Image | CPU/Mem | Port | Notes |
|---------|-------|---------|------|-------|
| `backend` | fintoc-backend | 256/512 | 8000 | Behind ALB |
| `celery-worker` | fintoc-backend | 256/512 | — | Same image, different CMD |
| `celery-beat` | fintoc-backend | 256/512 | — | Same image, beat CMD |
| `spa` | fintoc-spa | 256/512 | 80 | Behind ALB |

### Load Balancer
- **ALB**: Public-facing, HTTPS (ACM cert)
- Listener rules:
  - `/api/*` → backend target group
  - `/*` → spa target group

### Data
- **ElastiCache Redis**: `cache.t3.micro`, single-node, private subnet
- Celery broker + result backend point to ElastiCache endpoint

### Secrets
- **Secrets Manager**: `FINTOC_API_KEY`, `FINTOC_WEBHOOK_SECRET`
- **SSM Parameter Store**: `FINTOC_PRIVATE_KEY_PATH` (or store PEM in Secrets Manager)
- ECS task roles with `secretsmanager:GetSecretValue` permission

### Logging
- **CloudWatch Log Groups**: `/ecs/fintoc-backend`, `/ecs/fintoc-worker`, `/ecs/fintoc-beat`, `/ecs/fintoc-spa`

---

## 4.3 CI/CD (GitHub Actions)

### Workflow: `.github/workflows/deploy.yml`

```yaml
on:
  push:
    branches: [main]

jobs:
  deploy:
    steps:
      - Checkout
      - Configure AWS credentials
      - Login to ECR
      - Build & push backend image
      - Build & push SPA image
      - Update ECS services (force new deployment)
```

### Environment
- GitHub Secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_ACCOUNT_ID`
- Rolling deploy: ECS drains old tasks, starts new ones

---

## 4.4 Production Postgres (future iteration)

When ready to move off PGlite:

1. **RDS Postgres** (db.t3.micro) in private subnet
2. **Migrate schema**: `saved_counterparties`, `transfer_operations`, `transactions`
3. **Backend becomes source of truth**: new CRUD endpoints for operations/transactions
4. **SPA reads from API** instead of local PGlite
5. **Remove PGlite** dependency from SPA

---

## Execution Order

| # | Task | Est. |
|---|------|------|
| 1 | Create `spa/Dockerfile` + `spa/nginx.conf` | 15 min |
| 2 | Add `spa` service to `docker-compose.yml`, test locally | 10 min |
| 3 | Terraform VPC + networking | 30 min |
| 4 | Terraform ECR + ECS cluster | 20 min |
| 5 | Terraform ECS services (4 tasks) | 30 min |
| 6 | Terraform ALB + listener rules | 20 min |
| 7 | Terraform ElastiCache Redis | 15 min |
| 8 | Terraform Secrets Manager + IAM | 15 min |
| 9 | GitHub Actions CI/CD pipeline | 20 min |
| 10 | First deploy + smoke test | 15 min |

**Total estimate: ~3 hours**

---

## Environment Variables (Production)

| Variable | Source | Used by |
|----------|--------|---------|
| `FINTOC_API_KEY` | Secrets Manager | backend, celery-worker |
| `FINTOC_PRIVATE_KEY_PATH` | Secrets Manager (PEM) | backend, celery-worker |
| `FINTOC_WEBHOOK_SECRET` | Secrets Manager | backend |
| `FINTOC_WEBHOOK_TEST_URL` | SSM Parameter | backend (dev only) |
| `CELERY_BROKER_URL` | ElastiCache endpoint | backend, celery-worker, celery-beat |
| `CELERY_RESULT_BACKEND` | ElastiCache endpoint | backend, celery-worker, celery-beat |
