import type { SucceededTransactionRow } from "@/db/queries";

const CSV_HEADERS = [
  "tx_id",
  "operation_id",
  "amount",
  "currency",
  "scheduled_date",
  "fintoc_transfer_id",
  "idempotency_key",
  "tx_created_at",
  "account_id",
  "account_name",
  "counterparty_holder_id",
  "counterparty_holder_name",
  "counterparty_account_number",
  "counterparty_account_type",
  "counterparty_institution_id",
  "operation_total_amount",
  "comment",
  "description",
  "operation_status",
  "operation_created_at",
] as const;

function escapeCSV(value: unknown): string {
  const str = value == null ? "" : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function succeededTransactionsToCSV(rows: SucceededTransactionRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(",")];

  for (const r of rows) {
    lines.push(
      [
        r.tx_id,
        r.operation_id,
        r.amount,
        r.currency,
        r.scheduled_date,
        r.fintoc_transfer_id ?? "",
        r.idempotency_key,
        r.tx_created_at,
        r.account_id,
        r.account_name,
        r.counterparty_holder_id,
        r.counterparty_holder_name,
        r.counterparty_account_number,
        r.counterparty_account_type,
        r.counterparty_institution_id,
        r.total_amount,
        r.comment,
        r.description,
        r.operation_status,
        r.operation_created_at,
      ]
        .map(escapeCSV)
        .join(",")
    );
  }

  return lines.join("\n");
}

export function downloadCSV(csv: string, filename: string = "succeeded-transfers.csv") {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
