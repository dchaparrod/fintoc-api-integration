// ── Fintoc API types (fetched from backend) ──────────────

export interface FintocAccount {
  id: string;
  name: string | null;
  currency: string;
  balance: number | null;
  status: string | null;
  type: string | null;
}

export interface FintocCounterparty {
  id: string | null;
  holder_id: string | null;
  holder_name: string | null;
  account_number: string | null;
  account_type: string | null;
  institution_id: string | null;
}

export interface Institution {
  name: string;
  id: string;
}

// ── Local PGlite types (operations + transactions) ───────

export type OperationStatus = "pending" | "in_progress" | "completed" | "failed";

export interface TransferOperation {
  id: number;
  account_id: string;
  account_name: string;
  counterparty_holder_id: string;
  counterparty_holder_name: string;
  counterparty_account_number: string;
  counterparty_account_type: string;
  counterparty_institution_id: string;
  total_amount: number;
  currency: string;
  comment: string;
  description: string;
  created_at: string;
  status: OperationStatus;
}

export type TransactionStatus = "pending" | "processing" | "succeeded" | "failed" | "rejected";

export interface Transaction {
  id: number;
  transfer_operation_id: number;
  amount: number;
  scheduled_date: string;
  status: TransactionStatus;
  fintoc_transfer_id: string | null;
  idempotency_key: string;
  created_at: string;
}

export interface OperationWithDetails extends TransferOperation {
  transactions?: Transaction[];
}
