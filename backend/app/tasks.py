"""
Celery tasks for Fintoc transfer processing.
"""

import logging

from .celery_app import celery
from .transfer_pending import process_pending_transactions, build_pending_list_from_payload

logger = logging.getLogger(__name__)


@celery.task(bind=True, name="app.tasks.process_daily_pending")
def process_daily_pending(self, payload: list[dict] | None = None, simulate: bool = False):
    """
    Process pending transactions for today.

    Called either:
      - By Celery Beat on schedule (payload=None, beat just triggers — SPA must push data first)
      - By the API endpoint with a payload of pending transactions from PGlite

    Returns a summary dict with results and errors.
    """
    if not payload:
        logger.info("[BEAT] Daily pending task triggered but no payload provided. "
                     "Waiting for SPA to push pending transactions via API.")
        return {"status": "no_payload", "message": "No pending transactions to process"}

    logger.info("Processing %d pending transactions (simulate=%s)", len(payload), simulate)

    try:
        pending = build_pending_list_from_payload(payload)
    except (KeyError, ValueError) as e:
        error_msg = f"Invalid payload: {str(e)}"
        logger.error(error_msg)
        return {"status": "error", "message": error_msg}

    result = process_pending_transactions(pending, simulate=simulate)

    summary = {
        "status": "completed",
        "total_processed": len(result.results),
        "total_errors": len(result.errors),
        "results": [r.model_dump() for r in result.results],
        "errors": result.errors,
    }

    logger.info(
        "Daily pending complete: %d processed, %d errors",
        summary["total_processed"],
        summary["total_errors"],
    )

    return summary
