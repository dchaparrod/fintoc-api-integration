import logging
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .schemas import TransferRequest, TransferResponse, ExecutionResult
from .fintoc_client import execute_transfer
from .transfer_pending import process_pending_transactions, build_pending_list_from_payload

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(
    title="Fintoc Transfer Worker",
    description="Backend service for Fintoc transfer execution, JWS signing, and daily batch processing.",
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
