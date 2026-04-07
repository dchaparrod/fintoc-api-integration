"""
Daily batch executor for pending transactions.

For each client, finds today's pending transactions and executes them
up to the daily limit. This is the function the Celery worker will call
on a daily schedule.
"""

import logging
from .schemas import (
    TransferRequest,
    TransferResponse,
    CounterpartyRequest,
    PendingTransaction,
    ExecutionResult,
)
from .fintoc_client import execute_transfer

logger = logging.getLogger(__name__)

DAILY_LIMIT = 7_000_000


def process_pending_transactions(
    pending_txns: list[PendingTransaction],
    daily_limit: int = DAILY_LIMIT,
    simulate: bool = False,
) -> ExecutionResult:
    """
    Process a list of pending transactions for a single execution run.

    Groups by client_id and enforces daily_limit per client.
    Returns results and errors.
    """
    results: list[TransferResponse] = []
    errors: list[str] = []

    # Group by client
    by_client: dict[int, list[PendingTransaction]] = {}
    for txn in pending_txns:
        by_client.setdefault(txn.client_id, []).append(txn)

    for client_id, client_txns in by_client.items():
        daily_spent = 0

        for txn in client_txns:
            if daily_spent + txn.amount > daily_limit:
                logger.warning(
                    "Client %d: skipping txn %d (%s CLP) — would exceed daily limit (%s/%s)",
                    client_id,
                    txn.transaction_id,
                    f"{txn.amount:,}",
                    f"{daily_spent:,}",
                    f"{daily_limit:,}",
                )
                continue

            req = TransferRequest(
                client_id=txn.client_id,
                account_id=txn.account_id,
                amount=txn.amount,
                currency=txn.currency,
                comment=txn.comment,
                counterparty=txn.counterparty,
                idempotency_key=txn.idempotency_key,
                simulate=simulate,
            )

            try:
                result = execute_transfer(req, simulate=simulate)
                results.append(result)
                daily_spent += txn.amount

                logger.info(
                    "Client %d: txn %d executed — %s CLP — status: %s (daily total: %s)",
                    client_id,
                    txn.transaction_id,
                    f"{txn.amount:,}",
                    result.status,
                    f"{daily_spent:,}",
                )

            except Exception as e:
                error_msg = f"Client {client_id}, txn {txn.transaction_id}: {str(e)}"
                errors.append(error_msg)
                logger.error("Transfer execution failed: %s", error_msg)

    return ExecutionResult(results=results, errors=errors)


def build_pending_list_from_payload(
    payload: list[dict],
) -> list[PendingTransaction]:
    """
    Convert raw payload dicts (from the SPA) into PendingTransaction objects.
    Expected keys per dict:
      transaction_id, transfer_operation_id, client_id, account_id,
      amount, currency, comment, counterparty (dict)
    """
    txns = []
    for item in payload:
        cp = item["counterparty"]
        txns.append(
            PendingTransaction(
                transaction_id=item["transaction_id"],
                transfer_operation_id=item["transfer_operation_id"],
                client_id=item["client_id"],
                account_id=item["account_id"],
                amount=item["amount"],
                currency=item.get("currency", "CLP"),
                comment=item.get("comment", ""),
                counterparty=CounterpartyRequest(
                    holder_id=cp["holder_id"],
                    holder_name=cp["holder_name"],
                    account_number=cp["account_number"],
                    account_type=cp["account_type"],
                    institution_id=cp["institution_id"],
                ),
                idempotency_key=item["idempotency_key"],
            )
        )
    return txns
