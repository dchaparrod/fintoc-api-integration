import json
import logging
import os
import uuid
from pathlib import Path

from fintoc import Fintoc
from fintoc.errors import FintocError

from .schemas import TransferRequest, TransferResponse

logger = logging.getLogger(__name__)

FINTOC_API_KEY = os.getenv("FINTOC_API_KEY", "")
FINTOC_PRIVATE_KEY_PATH = os.getenv("FINTOC_PRIVATE_KEY_PATH", "")

INSTITUTIONS_PATH = Path(__file__).parent / "data" / "institutions.json"


def _get_client() -> Fintoc:
    kwargs: dict = {}
    if FINTOC_PRIVATE_KEY_PATH:
        kwargs["jws_private_key"] = FINTOC_PRIVATE_KEY_PATH
    return Fintoc(FINTOC_API_KEY, **kwargs)


# ── Institutions (hardcoded) ─────────────────────────────

def get_institutions() -> list[dict]:
    """Return the hardcoded list of Chilean financial institutions."""
    with open(INSTITUTIONS_PATH) as f:
        return json.load(f)


# ── Accounts (from Fintoc SDK) ───────────────────────────

def _serialize_account(acc: object) -> dict:
    entity = getattr(acc, "entity", None)
    return {
        "id": getattr(acc, "id", None),
        "name": getattr(entity, "holder_name", None) if entity else None,
        "currency": getattr(acc, "currency", "clp"),
        "balance": getattr(acc, "available_balance", None),
        "status": getattr(acc, "status", None),
        "type": getattr(acc, "type", None),
        "root_account_number": getattr(acc, "root_account_number", None),
        "root_account_number_id": getattr(acc, "root_account_number_id", None),
    }


def list_accounts() -> list[dict]:
    """Fetch all active accounts from Fintoc."""
    try:
        client = _get_client()
        accounts = client.v2.accounts.list(status="active", lazy=False)
        return [_serialize_account(acc) for acc in accounts]
    except FintocError as e:
        logger.error("Failed to list accounts: %s", str(e))
        raise
    except Exception as e:
        logger.error("Unexpected error listing accounts: %s", str(e))
        raise


def get_account(account_id: str) -> dict:
    """Fetch a single account by ID."""
    try:
        client = _get_client()
        acc = client.v2.accounts.get(account_id)
        return _serialize_account(acc)
    except FintocError as e:
        logger.error("Failed to get account %s: %s", account_id, str(e))
        raise


# ── Simulate (test mode) ────────────────────────────────

def simulate_receive_transfer(account_number_id: str, amount: int, currency: str = "CLP") -> dict:
    """Simulate receiving an inbound transfer to fund a test account."""
    try:
        client = _get_client()
        transfer = client.v2.simulate.receive_transfer(
            account_number_id=account_number_id,
            amount=amount,
            currency=currency,
        )
        return transfer.serialize()
    except FintocError as e:
        logger.error("Failed to simulate receive transfer: %s", str(e))
        raise
    except Exception as e:
        logger.error("Unexpected error simulating receive transfer: %s", str(e))
        raise


# ── Transfers ────────────────────────────────────────────

def execute_transfer(
    req: TransferRequest,
    simulate: bool = False,
) -> TransferResponse:
    """
    Execute a single transfer via Fintoc API.
    If simulate=True, skip the actual API call and return a mock response.
    """
    if simulate or req.simulate:
        logger.info(
            "[SIMULATE] Transfer of %s %s to %s (idempotency_key=%s)",
            req.amount,
            req.currency,
            req.counterparty.holder_name,
            req.idempotency_key,
        )
        return TransferResponse(
            id=f"sim_{uuid.uuid4().hex[:12]}",
            status="simulated",
            amount=req.amount,
            currency=req.currency,
        )

    try:
        client = _get_client()

        logger.info(
            "Executing transfer: %s %s to %s",
            req.amount,
            req.currency,
            req.counterparty.holder_name,
        )

        transfer = client.v2.transfers.create(
            idempotency_key=req.idempotency_key,
            amount=req.amount,
            currency=req.currency,
            account_id=req.account_id,
            comment=req.comment,
            counterparty={
                "holder_id": req.counterparty.holder_id,
                "holder_name": req.counterparty.holder_name,
                "account_number": req.counterparty.account_number,
                "account_type": req.counterparty.account_type,
                "institution_id": req.counterparty.institution_id,
            },
            metadata=req.metadata or {},
        )

        return TransferResponse(
            id=transfer.id,
            status=transfer.status,
            amount=transfer.amount,
            currency=transfer.currency,
        )

    except FintocError as e:
        logger.error("Fintoc API error: %s", str(e))
        return TransferResponse(
            id="",
            status="failed",
            amount=req.amount,
            currency=req.currency,
            error=str(e),
        )
    except Exception as e:
        logger.error("Unexpected error during transfer: %s", str(e))
        return TransferResponse(
            id="",
            status="failed",
            amount=req.amount,
            currency=req.currency,
            error=f"Unexpected error: {str(e)}",
        )
