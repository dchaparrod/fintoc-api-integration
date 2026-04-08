#!/usr/bin/env python3
"""
CLI tool to export succeeded transfers from the webhook event store to CSV.

Usage (from repo root):
    docker compose exec backend python -m app.export_csv
    docker compose exec backend python -m app.export_csv --output /tmp/report.csv

Without Docker:
    cd backend && python -m app.export_csv
"""

import argparse
import csv
import sys

from .webhooks import get_webhook_events

CSV_HEADERS = [
    "event_id",
    "event_type",
    "transfer_id",
    "status",
    "timestamp",
    "amount",
    "currency",
    "counterparty_holder_name",
    "counterparty_account_number",
    "counterparty_institution_id",
    "comment",
]


def build_rows(events: list[dict]) -> list[dict]:
    """Extract flat CSV rows from webhook events."""
    rows = []
    for e in events:
        raw = e.get("raw_payload", {})
        data = raw.get("data", {})
        counterparty = data.get("counterparty", {})

        rows.append({
            "event_id": e.get("id", ""),
            "event_type": e.get("event_type", ""),
            "transfer_id": e.get("transfer_id", ""),
            "status": e.get("status", ""),
            "timestamp": e.get("timestamp", ""),
            "amount": data.get("amount", ""),
            "currency": data.get("currency", ""),
            "counterparty_holder_name": counterparty.get("holder_name", ""),
            "counterparty_account_number": counterparty.get("account_number", ""),
            "counterparty_institution_id": counterparty.get("institution_id", ""),
            "comment": data.get("comment", ""),
        })
    return rows


def main():
    parser = argparse.ArgumentParser(description="Export succeeded transfer events to CSV")
    parser.add_argument(
        "--output", "-o",
        default=None,
        help="Output file path. Defaults to stdout.",
    )
    parser.add_argument(
        "--all", "-a",
        action="store_true",
        default=False,
        help="Include all event types, not just transfer.succeeded.",
    )
    args = parser.parse_args()

    events = get_webhook_events(limit=200)

    if not args.all:
        events = [e for e in events if e.get("event_type") == "transfer.succeeded"]

    rows = build_rows(events)

    if not rows:
        print("No succeeded transfer events found.", file=sys.stderr)
        sys.exit(0)

    if args.output:
        dest = open(args.output, "w", newline="")
        print(f"Writing {len(rows)} rows to {args.output}", file=sys.stderr)
    else:
        dest = sys.stdout

    writer = csv.DictWriter(dest, fieldnames=CSV_HEADERS)
    writer.writeheader()
    writer.writerows(rows)

    if args.output:
        dest.close()
        print(f"Done. {len(rows)} events exported.", file=sys.stderr)


if __name__ == "__main__":
    main()
