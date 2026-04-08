"""
Development-only webhook simulator.

Polls the Fintoc API every 10 seconds for recent transfers,
detects status changes, and feeds them into the local webhook handler
as if Fintoc had sent a real webhook event.

Only runs when APP_ENV=development.
"""

import asyncio
import json
import logging
import os

from fintoc import Fintoc
from fintoc.errors import FintocError

from .webhooks import handle_webhook_event

logger = logging.getLogger(__name__)

FINTOC_API_KEY = os.getenv("FINTOC_API_KEY", "")
FINTOC_PRIVATE_KEY_PATH = os.getenv("FINTOC_PRIVATE_KEY_PATH", "")
POLL_INTERVAL = 10  # seconds

# Track known transfer statuses to detect changes
_known_statuses: dict[str, str] = {}


def _get_client() -> Fintoc:
    kwargs: dict = {}
    if FINTOC_PRIVATE_KEY_PATH:
        kwargs["jws_private_key"] = FINTOC_PRIVATE_KEY_PATH
    return Fintoc(FINTOC_API_KEY, **kwargs)


def _poll_transfers() -> list[dict]:
    """Fetch recent transfers from all accounts and detect status changes."""
    events = []
    try:
        client = _get_client()
        accounts = client.v2.accounts.list(status="active", lazy=False)

        for acc in accounts:
            try:
                transfers = client.v2.transfers.list(
                    account_id=acc.id,
                    lazy=False,
                )
                for t in transfers:
                    tid = t.id
                    status = t.status
                    prev = _known_statuses.get(tid)

                    if prev == status:
                        continue  # no change

                    _known_statuses[tid] = status

                    # Skip initial population (don't fire events for existing transfers)
                    if prev is None:
                        continue

                    # Build a synthetic webhook payload
                    event_type = f"transfer.{status}"
                    counterparty = getattr(t, "counterparty", None)
                    payload = {
                        "type": event_type,
                        "data": {
                            "id": tid,
                            "status": status,
                            "amount": getattr(t, "amount", 0),
                            "currency": getattr(t, "currency", "CLP"),
                            "counterparty": {
                                "holder_name": getattr(counterparty, "holder_name", "") if counterparty else "",
                                "account_number": getattr(counterparty, "account_number", "") if counterparty else "",
                                "institution_id": getattr(counterparty, "institution_id", "") if counterparty else "",
                            } if counterparty else {},
                        },
                    }

                    events.append(payload)
                    logger.info(
                        "[WebhookSim] Transfer %s changed: %s → %s",
                        tid, prev, status,
                    )

            except FintocError as e:
                logger.debug("[WebhookSim] Failed to list transfers for %s: %s", acc.id, e)
            except Exception as e:
                logger.debug("[WebhookSim] Unexpected error for %s: %s", acc.id, e)

    except FintocError as e:
        logger.warning("[WebhookSim] Failed to list accounts: %s", e)
    except Exception as e:
        logger.warning("[WebhookSim] Unexpected error: %s", e)

    return events


async def _run_simulator():
    """Background loop: poll Fintoc, feed status changes into webhook handler."""
    logger.info("[WebhookSim] Starting development webhook simulator (every %ds)", POLL_INTERVAL)

    # Initial population run
    await asyncio.get_event_loop().run_in_executor(None, _poll_transfers)
    logger.info("[WebhookSim] Initial transfer snapshot: %d transfers tracked", len(_known_statuses))

    while True:
        await asyncio.sleep(POLL_INTERVAL)
        try:
            events = await asyncio.get_event_loop().run_in_executor(None, _poll_transfers)
            for payload in events:
                handle_webhook_event(
                    payload=json.dumps(payload),
                    signature="",
                    secret="",  # skip validation in dev
                )
                logger.info(
                    "[WebhookSim] Injected event: %s for %s",
                    payload["type"],
                    payload["data"]["id"],
                )
        except Exception as e:
            logger.warning("[WebhookSim] Poll cycle failed: %s", e)


def start_simulator():
    """Schedule the simulator as a background asyncio task."""
    loop = asyncio.get_event_loop()
    loop.create_task(_run_simulator())
