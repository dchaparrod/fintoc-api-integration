"""
Simulation module for multi-day transfer splitting.

This module is for internal/testing use — not exposed as an API endpoint.
It accepts a list of large operations and returns the multi-day split plan,
optionally running "false transactions" to verify the system works end-to-end.
"""

import logging
import uuid
from datetime import date, timedelta
from dataclasses import dataclass, field

from ..schemas import TransferRequest, CounterpartyRequest, TransferResponse
from ..fintoc_client import execute_transfer

logger = logging.getLogger(__name__)

DAILY_LIMIT = 7_000_000


@dataclass
class SimulatedTransaction:
    day: int
    scheduled_date: date
    amount: int
    client_id: int
    idempotency_key: str
    result: TransferResponse | None = None


@dataclass
class SimulatedOperation:
    client_id: int
    total_amount: int
    counterparty_name: str
    transactions: list[SimulatedTransaction] = field(default_factory=list)
    total_days: int = 0


@dataclass
class SimulationPlan:
    operations: list[SimulatedOperation] = field(default_factory=list)
    total_transactions: int = 0
    total_days: int = 0
    total_amount: int = 0


def simulate_split(
    operations: list[dict],
    daily_limit: int = DAILY_LIMIT,
    start_date: date | None = None,
) -> SimulationPlan:
    """
    Given a list of operation dicts, compute how they would be split
    across multiple days per client.

    Each operation dict should have:
      - client_id: int
      - total_amount: int
      - counterparty_name: str (for display)

    Returns a SimulationPlan with the full breakdown.
    """
    if start_date is None:
        start_date = date.today()

    plan = SimulationPlan()

    for op_data in operations:
        client_id = op_data["client_id"]
        total_amount = op_data["total_amount"]
        counterparty_name = op_data.get("counterparty_name", "Unknown")

        sim_op = SimulatedOperation(
            client_id=client_id,
            total_amount=total_amount,
            counterparty_name=counterparty_name,
        )

        remaining = total_amount
        day_offset = 0

        while remaining > 0:
            chunk = min(remaining, daily_limit)
            scheduled = start_date + timedelta(days=day_offset)

            sim_tx = SimulatedTransaction(
                day=day_offset + 1,
                scheduled_date=scheduled,
                amount=chunk,
                client_id=client_id,
                idempotency_key=str(uuid.uuid4()),
            )
            sim_op.transactions.append(sim_tx)

            remaining -= chunk
            day_offset += 1

        sim_op.total_days = day_offset
        plan.operations.append(sim_op)
        plan.total_transactions += len(sim_op.transactions)
        plan.total_days = max(plan.total_days, sim_op.total_days)
        plan.total_amount += total_amount

    return plan


def simulate_execution(
    plan: SimulationPlan,
    account_id: str = "acc_test_simulate",
    counterparty: CounterpartyRequest | None = None,
) -> SimulationPlan:
    """
    Run simulated (dry-run) transfers for every transaction in the plan.
    Uses simulate=True flag so no actual Fintoc API calls are made.

    Mutates and returns the same plan with results attached to each transaction.
    """
    if counterparty is None:
        counterparty = CounterpartyRequest(
            holder_id="111111111",  # 11.111.111-1 (valid RUT)
            holder_name="Simulated Counterparty",
            account_number="000000000",
            account_type="checking_account",
            institution_id="cl_banco_de_chile",
        )

    for op in plan.operations:
        for tx in op.transactions:
            req = TransferRequest(
                client_id=tx.client_id,
                account_id=account_id,
                amount=tx.amount,
                currency="CLP",
                comment=f"[SIMULATE] Day {tx.day}",
                counterparty=counterparty,
                idempotency_key=tx.idempotency_key,
                simulate=True,
            )
            result = execute_transfer(req, simulate=True)
            tx.result = result

            logger.info(
                "[SIMULATE] Day %d | Client %d | %s CLP | Status: %s | ID: %s",
                tx.day,
                tx.client_id,
                f"{tx.amount:,}",
                result.status,
                result.id,
            )

    return plan


def print_plan(plan: SimulationPlan) -> str:
    """Pretty-print a simulation plan to a string for logging/testing."""
    lines = []
    lines.append("=== Simulation Plan ===")
    lines.append(f"Total operations: {len(plan.operations)}")
    lines.append(f"Total transactions: {plan.total_transactions}")
    lines.append(f"Total days needed: {plan.total_days}")
    lines.append(f"Total amount: ${plan.total_amount:,} CLP")
    lines.append("")

    for i, op in enumerate(plan.operations, 1):
        lines.append(f"Operation {i}: Client {op.client_id} → {op.counterparty_name}")
        lines.append(f"  Total: ${op.total_amount:,} CLP over {op.total_days} day(s)")
        for tx in op.transactions:
            status = f" → {tx.result.status}" if tx.result else ""
            lines.append(
                f"  Day {tx.day} ({tx.scheduled_date}): ${tx.amount:,} CLP{status}"
            )
        lines.append("")

    return "\n".join(lines)
