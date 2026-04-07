import json
import logging
import os
import uuid
from pathlib import Path

from fintoc import Fintoc
from fintoc.errors import FintocError

from .jws import generate_jws_signature_header
from .schemas import TransferRequest, TransferResponse

logger = logging.getLogger(__name__)

FINTOC_API_KEY = os.getenv("FINTOC_API_KEY", "")

INSTITUTIONS_PATH = Path(__file__).parent / "institutions.json"


def _get_client() -> Fintoc:
    return Fintoc(FINTOC_API_KEY)


# ── Institutions (hardcoded) ─────────────────────────────

def get_institutions() -> list[dict]:
    """Return the hardcoded list of Chilean financial institutions."""
    with open(INSTITUTIONS_PATH) as f:
        return json.load(f)


# ── Accounts (from Fintoc API) ───────────────────────────

def list_accounts() -> list[dict]:
    """Fetch all active accounts from Fintoc."""
    try:
        client = _get_client()
        accounts = client.v2.accounts.all(status="active")
        return [
            {
                "id": acc.id,
                "name": getattr(acc, "name", None),
                "currency": getattr(acc, "currency", "clp"),
                "balance": getattr(acc, "balance", None),
                "status": getattr(acc, "status", None),
                "type": getattr(acc, "type", None),
            }
            for acc in accounts
        ]
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
        return {
            "id": acc.id,
            "name": getattr(acc, "name", None),
            "currency": getattr(acc, "currency", "clp"),
            "balance": getattr(acc, "balance", None),
            "status": getattr(acc, "status", None),
            "type": getattr(acc, "type", None),
        }
    except FintocError as e:
        logger.error("Failed to get account %s: %s", account_id, str(e))
        raise


# ── Counterparties (from Fintoc API) ─────────────────────

def list_counterparties() -> list[dict]:
    """Fetch all counterparties from Fintoc."""
    try:
        client = _get_client()
        counterparties = client.v2.counterparties.all()
        return [
            {
                "id": getattr(cp, "id", None),
                "holder_id": getattr(cp, "holder_id", None),
                "holder_name": getattr(cp, "holder_name", None),
                "account_number": getattr(cp, "account_number", None),
                "account_type": getattr(cp, "account_type", None),
                "institution_id": getattr(cp, "institution_id", None),
            }
            for cp in counterparties
        ]
    except FintocError as e:
        logger.error("Failed to list counterparties: %s", str(e))
        raise


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

        body = {
            "amount": req.amount,
            "currency": req.currency,
            "account_id": req.account_id,
            "comment": req.comment,
            "counterparty": {
                "holder_id": req.counterparty.holder_id,
                "holder_name": req.counterparty.holder_name,
                "account_number": req.counterparty.account_number,
                "account_type": req.counterparty.account_type,
                "institution_id": req.counterparty.institution_id,
            },
        }
        if req.metadata:
            body["metadata"] = req.metadata

        raw_body = json.dumps(body)
        # JWS signature for Fintoc-JWS-Signature header
        # Note: The SDK handles headers internally; this is generated
        # for manual/curl usage or future custom HTTP calls.
        _jws_signature = generate_jws_signature_header(raw_body)  # noqa: F841

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
