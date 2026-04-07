"""
Webhook event handling for Fintoc transfer status updates.

Events are stored in-memory for the SPA to poll. In production,
this should be backed by a persistent store (Postgres/Redis).
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from threading import Lock

logger = logging.getLogger(__name__)

# In-memory event store (thread-safe)
_events: list[dict] = []
_lock = Lock()
MAX_EVENTS = 1000


def handle_webhook_event(payload: str, signature: str, secret: str) -> dict:
    """
    Validate and store a Fintoc webhook event.

    Args:
        payload: Raw request body as string
        signature: Fintoc-Signature header value
        secret: Webhook secret for signature validation

    Returns:
        The stored event dict

    Raises:
        ValueError: If signature is invalid or payload can't be parsed
    """
    # Validate signature if secret is configured
    if secret:
        try:
            from fintoc import WebhookSignature
            WebhookSignature.verify_header(
                payload=payload,
                header=signature,
                secret=secret,
            )
            logger.info("Webhook signature verified successfully")
        except Exception as e:
            logger.warning("Webhook signature validation failed: %s", str(e))
            raise ValueError(f"Invalid webhook signature: {str(e)}")
    else:
        logger.warning("No FINTOC_WEBHOOK_SECRET configured — skipping signature validation")

    # Parse the event payload
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON payload: {str(e)}")

    # Extract transfer info from event
    event_type = data.get("type", "unknown")
    event_data = data.get("data", {})
    transfer_id = event_data.get("id", "")
    transfer_status = event_data.get("status", "")

    event = {
        "id": str(uuid.uuid4()),
        "event_type": event_type,
        "transfer_id": transfer_id,
        "status": transfer_status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "raw_payload": data,
    }

    with _lock:
        _events.append(event)
        # Trim old events if over limit
        if len(_events) > MAX_EVENTS:
            _events[:] = _events[-MAX_EVENTS:]

    logger.info(
        "Webhook event stored: type=%s transfer=%s status=%s",
        event_type,
        transfer_id,
        transfer_status,
    )

    return event


def get_webhook_events(since: str | None = None, limit: int = 50) -> list[dict]:
    """
    Return recent webhook events, optionally filtered by timestamp.

    Args:
        since: ISO timestamp — only return events after this time
        limit: Max number of events to return
    """
    with _lock:
        events = list(_events)

    if since:
        events = [e for e in events if e["timestamp"] > since]

    # Return most recent first, capped at limit
    return list(reversed(events[-limit:]))
