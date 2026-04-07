from pydantic import BaseModel
from typing import Optional


# ── Counterparty ──────────────────────────────────────────

class CounterpartyRequest(BaseModel):
    holder_id: str
    holder_name: str
    account_number: str
    account_type: str
    institution_id: str


# ── Transfer ─────────────────────────────────────────────

class TransferRequest(BaseModel):
    client_id: int
    account_id: str
    amount: int
    currency: str = "CLP"
    comment: str = ""
    counterparty: CounterpartyRequest
    idempotency_key: str
    simulate: bool = False
    metadata: Optional[dict] = None


class TransferResponse(BaseModel):
    id: str
    status: str
    amount: int
    currency: str
    error: Optional[str] = None


class PendingTransaction(BaseModel):
    transaction_id: int
    transfer_operation_id: int
    client_id: int
    account_id: str
    amount: int
    currency: str
    comment: str
    counterparty: CounterpartyRequest
    idempotency_key: str


class ExecutionResult(BaseModel):
    results: list[TransferResponse]
    errors: list[str]


# ── Simulate ─────────────────────────────────────────────

class SimulateReceiveRequest(BaseModel):
    account_number_id: str
    amount: int
    currency: str = "CLP"
