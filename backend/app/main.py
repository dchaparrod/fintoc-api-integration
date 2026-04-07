import logging

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .schemas import TransferRequest, TransferResponse, ExecutionResult, CreateCounterpartyRequest
from .fintoc_client import (
    execute_transfer,
    list_accounts,
    get_account,
    list_counterparties,
    get_counterparty,
    create_counterparty,
    delete_counterparty,
    get_institutions,
)
from .transfer_pending import process_pending_transactions, build_pending_list_from_payload

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


@app.get("/api/counterparties")
async def api_list_counterparties():
    """List all Fintoc counterparties."""
    try:
        return list_counterparties()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.get("/api/counterparties/{counterparty_id}")
async def api_get_counterparty(counterparty_id: str):
    """Get a single Fintoc counterparty by ID."""
    try:
        return get_counterparty(counterparty_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.post("/api/counterparties")
async def api_create_counterparty(req: CreateCounterpartyRequest):
    """Create a new counterparty in Fintoc."""
    try:
        return create_counterparty(req)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@app.delete("/api/counterparties/{counterparty_id}")
async def api_delete_counterparty(counterparty_id: str):
    """Delete a counterparty from Fintoc."""
    try:
        delete_counterparty(counterparty_id)
        return {"status": "deleted"}
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
