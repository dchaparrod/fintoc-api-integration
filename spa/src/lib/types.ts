export interface Client {
  id: number;
  name: string;
  rut: string;
  account_id: string;
  daily_limit: number;
}

export interface ClientCounterparty {
  id: number;
  client_id: number;
  holder_id: string;
  holder_name: string;
  account_number: string;
  account_type: "checking_account" | "sight_account";
  institution_id: string;
}

export type OperationStatus = "pending" | "in_progress" | "completed" | "failed";

export interface TransferOperation {
  id: number;
  client_id: number;
  client_counterparty_id: number;
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

export interface DailyExecutionLog {
  id: number;
  client_id: number;
  execution_date: string;
  total_executed: number;
  status: string;
}

export interface OperationWithDetails extends TransferOperation {
  client_name?: string;
  client_rut?: string;
  counterparty_name?: string;
  transactions?: Transaction[];
}
