import logging
import os
from datetime import date
from typing import Optional

from celery.result import AsyncResult
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware

from .celery_app import celery
from .schemas import (
    TransferRequest,
    TransferResponse,
    ExecutionResult,
    SimulateReceiveRequest,
    SplitTransferRequest,
    ExecutionPlanRequest,
)
from .fintoc_client import (
    execute_transfer,
    list_accounts,
    get_account,
    get_institutions,
    simulate_receive_transfer,
)
from .simulate import simulate_split
from .transfer_pending import process_pending_transactions, build_pending_list_from_payload
from .webhooks import handle_webhook_event, get_webhook_events

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="Fintoc Transfer Backend",
    description="Backend service for Fintoc accounts, counterparties, transfer execution, JWS signing, and daily batch processing.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Fintoc Data Endpoints ─────────────────────────────────

@app.get("/api/accounts")
async def api_list_accounts():
    """List all active Fintoc accounts."""
    try:
        return list_accounts()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/accounts/{account_id}")
async def api_get_account(account_id: str):
    """Get a single Fintoc account by ID."""
    try:
        return get_account(account_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/institutions")
async def api_list_institutions():
    """List hardcoded Chilean financial institutions."""
    return get_institutions()


# ── Transfer Endpoints ────────────────────────────────────

@app.post("/api/transfer", response_model=TransferResponse)
async def create_transfer(req: TransferRequest):
    """Execute a single transfer via Fintoc API (or simulate if flag is set)."""
    result = execute_transfer(req, simulate=req.simulate)
    if result.error:
        raise HTTPException(status_code=502, detail=result.error)
    return result


@app.post("/api/transfer-pending", response_model=ExecutionResult)
async def run_pending_transfers(
    payload: list[dict] = [],
    simulate: bool = Query(default=False),
):
    """
    Execute pending transactions sent from the SPA.

    The SPA collects pending transactions from PGlite and sends them here.
    This endpoint processes them, respecting daily limits per client.
    """
    if not payload:
        return ExecutionResult(results=[], errors=["No pending transactions provided"])

    try:
        pending = build_pending_list_from_payload(payload)
    except (KeyError, ValueError) as e:
        raise HTTPException(status_code=422, detail=f"Invalid payload: {str(e)}")

    result = process_pending_transactions(pending, simulate=simulate)
    return result


# ── Simulate (test mode) ─────────────────────────────────

@app.post("/api/simulate/receive-transfer")
async def api_simulate_receive_transfer(req: SimulateReceiveRequest):
    """Simulate receiving an inbound transfer to fund a test account."""
    try:
        return simulate_receive_transfer(req.account_number_id, req.amount, req.currency)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/simulate/split-transfer")
async def api_simulate_split(req: SplitTransferRequest):
    """Preview how a large transfer would be split across multiple days."""
    plan = simulate_split(
        operations=[{
            "client_id": 1,
            "total_amount": req.total_amount,
            "counterparty_name": req.counterparty_name or "Preview",
        }],
        daily_limit=req.daily_limit or 7_000_000,
        start_date=date.fromisoformat(req.start_date) if req.start_date else None,
    )
    op = plan.operations[0] if plan.operations else None
    if not op:
        raise HTTPException(status_code=400, detail="Could not generate split plan")

    schedule = []
    cumulative = 0
    remaining = req.total_amount
    for tx in op.transactions:
        cumulative += tx.amount
        remaining -= tx.amount
        schedule.append({
            "day": tx.day,
            "date": tx.scheduled_date.isoformat(),
            "amount": tx.amount,
            "cumulative": cumulative,
            "remaining": remaining,
        })

    return {
        "total_amount": req.total_amount,
        "daily_limit": req.daily_limit or 7_000_000,
        "total_days": op.total_days,
        "total_transactions": len(op.transactions),
        "schedule": schedule,
    }


@app.post("/api/simulate/execution-plan")
async def api_execution_plan(req: ExecutionPlanRequest):
    """Return the full execution plan showing what the worker will execute per day."""
    plan = simulate_split(
        operations=[{
            "client_id": 1,
            "total_amount": req.total_amount,
            "counterparty_name": req.counterparty_name or "Unknown",
        }],
        daily_limit=req.daily_limit or 7_000_000,
        start_date=date.fromisoformat(req.start_date) if req.start_date else None,
    )
    op = plan.operations[0] if plan.operations else None
    if not op:
        raise HTTPException(status_code=400, detail="Could not generate execution plan")

    schedule = []
    cumulative = 0
    remaining = req.total_amount
    for tx in op.transactions:
        cumulative += tx.amount
        remaining -= tx.amount
        schedule.append({
            "day": tx.day,
            "date": tx.scheduled_date.isoformat(),
            "amount": tx.amount,
            "cumulative": cumulative,
            "remaining": remaining,
            "idempotency_key": tx.idempotency_key,
        })

    return {
        "operation": {
            "total_amount": req.total_amount,
            "currency": req.currency or "CLP",
            "counterparty": req.counterparty_name or "Unknown",
            "account_id": req.account_id or "",
        },
        "daily_limit": req.daily_limit or 7_000_000,
        "total_days": op.total_days,
        "total_transactions": len(op.transactions),
        "schedule": schedule,
    }


# ── Celery Task Endpoints ────────────────────────────────

@app.post("/api/tasks/process-pending")
async def api_enqueue_pending(
    payload: list[dict],
    simulate: bool = Query(default=False),
):
    """Enqueue pending transactions for async processing by Celery worker."""
    if not payload:
        raise HTTPException(status_code=422, detail="Empty payload")

    task = celery.send_task(
        "app.tasks.process_daily_pending",
        kwargs={"payload": payload, "simulate": simulate},
    )
    return {"task_id": task.id, "status": "queued"}


@app.get("/api/tasks/{task_id}/status")
async def api_task_status(task_id: str):
    """Check the status and result of a Celery task."""
    result = AsyncResult(task_id, app=celery)
    response = {
        "task_id": task_id,
        "status": result.status,
    }
    if result.ready():
        if result.successful():
            response["result"] = result.result
        else:
            response["error"] = str(result.result)
    return response


# ── Webhook Endpoints ────────────────────────────────────

FINTOC_WEBHOOK_SECRET = os.getenv("FINTOC_WEBHOOK_SECRET", "")


@app.post("/api/webhooks/fintoc")
async def api_fintoc_webhook(request: Request):
    """Receive Fintoc webhook events for transfer status updates."""
    body = await request.body()
    signature = request.headers.get("Fintoc-Signature", "")

    try:
        event = handle_webhook_event(
            payload=body.decode("utf-8"),
            signature=signature,
            secret=FINTOC_WEBHOOK_SECRET,
        )
        return {"received": True, "event_id": event["id"]}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/webhook-events")
async def api_list_webhook_events(
    since: Optional[str] = Query(default=None),
    limit: int = Query(default=50, le=200),
):
    """Return recent webhook events for the SPA to poll."""
    return get_webhook_events(since=since, limit=limit)
