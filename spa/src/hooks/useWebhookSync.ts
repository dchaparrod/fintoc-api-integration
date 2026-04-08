import { useEffect, useRef, useCallback } from "react";
import { fetchWebhookEvents } from "@/services/api";
import { updateTransactionStatus, updateOperationStatus } from "@/db/queries";
import { getDb } from "@/db/index";

const POLL_INTERVAL_MS = 10_000; // 10 seconds

/**
 * Polls the backend for new Fintoc webhook events and syncs
 * transfer statuses back to PGlite.
 */
export function useWebhookSync(enabled: boolean = true) {
  const lastSeenRef = useRef<string | null>(null);

  const sync = useCallback(async () => {
    try {
      const events = await fetchWebhookEvents(lastSeenRef.current ?? undefined);
      if (events.length === 0) return;

      // Update last seen timestamp
      lastSeenRef.current = events[0].timestamp;

      for (const event of events) {
        if (!event.transfer_id) continue;

        const newStatus = mapEventStatus(event.event_type);
        if (!newStatus) continue;

        // Find the transaction in PGlite by fintoc_transfer_id
        const db = await getDb();
        const res = await db.query<{ id: number; transfer_operation_id: number }>(
          "SELECT id, transfer_operation_id FROM transactions WHERE fintoc_transfer_id = $1",
          [event.transfer_id]
        );

        if (res.rows.length === 0) continue;

        const tx = res.rows[0];
        await updateTransactionStatus(tx.id, newStatus, event.transfer_id);

        // Check if all transactions in the operation are resolved
        await checkAndUpdateOperation(tx.transfer_operation_id);
      }
    } catch (err) {
      console.warn("[WebhookSync] Poll failed:", err);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Initial sync
    sync();

    const interval = setInterval(sync, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [enabled, sync]);
}

function mapEventStatus(eventType: string): string | null {
  switch (eventType) {
    case "transfer.succeeded":
      return "succeeded";
    case "transfer.failed":
      return "failed";
    case "transfer.rejected":
      return "rejected";
    default:
      return null;
  }
}

async function checkAndUpdateOperation(operationId: number) {
  const db = await getDb();

  const res = await db.query<{ status: string }>(
    "SELECT status FROM transactions WHERE transfer_operation_id = $1",
    [operationId]
  );

  const statuses = res.rows.map((r) => r.status);

  if (statuses.length === 0) return;

  // All done?
  const allResolved = statuses.every((s) =>
    ["succeeded", "failed", "rejected"].includes(s)
  );

  if (!allResolved) return;

  // If any failed/rejected, operation is failed; otherwise completed
  const hasFailed = statuses.some((s) => s === "failed" || s === "rejected");
  const newStatus = hasFailed ? "failed" : "completed";

  await updateOperationStatus(operationId, newStatus);
}
