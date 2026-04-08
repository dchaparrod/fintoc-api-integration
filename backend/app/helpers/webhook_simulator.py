"""
Development-only webhook simulator.

Runs as a Celery Beat periodic task (every 10 seconds).
Polls the Fintoc API for outbound transfer status changes
and feeds them into the local webhook handler as synthetic events.

Only active when APP_ENV=development.
"""

import json
import logging
import os

import httpx
from fintoc import Fintoc
from fintoc.errors import FintocError

logger = logging.getLogger(__name__)

FINTOC_API_KEY = os.getenv("FINTOC_API_KEY", "")
FINTOC_PRIVATE_KEY_PATH = os.getenv("FINTOC_PRIVATE_KEY_PATH", "")
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")

TERMINAL_STATUSES = {"succeeded", "failed", "rejected", "returned"}

# Track known transfer statuses across task invocations (worker process memory)
_known_statuses: dict[str, str] = {}
_initialized: bool = False


def _get_client() -> Fintoc:
    kwargs: dict = {}
    if FINTOC_PRIVATE_KEY_PATH:
        kwargs["jws_private_key"] = FINTOC_PRIVATE_KEY_PATH
    return Fintoc(FINTOC_API_KEY, **kwargs)


def _build_payload(t: object) -> dict:
    """Build a synthetic webhook payload from a Fintoc transfer object."""
    status = getattr(t, "status", "unknown")
    counterparty = getattr(t, "counterparty", None)
    return {
        "type": f"transfer.{status}",
        "data": {
            "id": getattr(t, "id", ""),
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


def poll_and_inject() -> dict:
    """Poll Fintoc for outbound transfer status changes and inject webhook events.

    Called by Celery Beat every 10 seconds.
    Returns a summary dict for task result tracking.
    """
    global _initialized

    initial = not _initialized
    events: list[dict] = []

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
                    direction = getattr(t, "direction", "outbound")

                    # Only track outbound transfers (the ones we created)
                    if direction != "outbound":
                        if tid not in _known_statuses:
                            _known_statuses[tid] = status
                        continue

                    prev = _known_statuses.get(tid)

                    if prev == status:
                        continue  # no change

                    _known_statuses[tid] = status

                    if initial and status in TERMINAL_STATUSES:
                        events.append(_build_payload(t))
                        logger.info("[WebhookSim] Initial catchup: %s is %s", tid, status)
                    elif prev is not None:
                        events.append(_build_payload(t))
                        logger.info("[WebhookSim] Transfer %s changed: %s → %s", tid, prev, status)

            except FintocError as e:
                logger.debug("[WebhookSim] Failed to list transfers for %s: %s", acc.id, e)
            except Exception as e:
                logger.debug("[WebhookSim] Unexpected error for %s: %s", acc.id, e)

    except FintocError as e:
        logger.warning("[WebhookSim] Failed to list accounts: %s", e)
    except Exception as e:
        logger.warning("[WebhookSim] Unexpected error: %s", e)

    # POST events to the backend webhook endpoint
    for payload in events:
        try:
            resp = httpx.post(
                f"{BACKEND_URL}/api/webhooks/fintoc",
                content=json.dumps(payload),
                headers={"Content-Type": "application/json"},
                timeout=5.0,
            )
            resp.raise_for_status()
            logger.info("[WebhookSim] Injected: %s for %s", payload["type"], payload["data"]["id"])
        except httpx.HTTPError as e:
            logger.warning("[WebhookSim] Failed to POST event for %s: %s", payload["data"]["id"], e)

    if initial:
        _initialized = True
        logger.info("[WebhookSim] Initial snapshot: %d transfers tracked, %d catchup events",
                    len(_known_statuses), len(events))

    return {"tracked": len(_known_statuses), "events_injected": len(events)}
