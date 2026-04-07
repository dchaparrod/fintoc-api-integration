import { getDb } from "./index";
import type {
  SavedCounterparty,
  TransferOperation,
  Transaction,
  OperationWithDetails,
} from "@/lib/types";

const DAILY_LIMIT = 7_000_000;

// ── Saved Counterparties ────────────────────────────────

export async function listSavedCounterparties(): Promise<SavedCounterparty[]> {
  const db = await getDb();
  const res = await db.query<SavedCounterparty>(
    "SELECT * FROM saved_counterparties ORDER BY holder_name"
  );
  return res.rows;
}

export interface CreateCounterpartyParams {
  holderId: string;
  holderName: string;
  accountNumber: string;
  accountType: string;
  institutionId: string;
}

export async function createSavedCounterparty(
  params: CreateCounterpartyParams
): Promise<SavedCounterparty> {
  const db = await getDb();
  const res = await db.query<SavedCounterparty>(
    `INSERT INTO saved_counterparties (holder_id, holder_name, account_number, account_type, institution_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [params.holderId, params.holderName, params.accountNumber, params.accountType, params.institutionId]
  );
  return res.rows[0];
}

export async function deleteSavedCounterparty(id: number): Promise<void> {
  const db = await getDb();
  await db.query("DELETE FROM saved_counterparties WHERE id = $1", [id]);
}

// ── Transfer Operations ──────────────────────────────────

export interface CreateOperationParams {
  accountId: string;
  accountName: string;
  counterpartyHolderId: string;
  counterpartyHolderName: string;
  counterpartyAccountNumber: string;
  counterpartyAccountType: string;
  counterpartyInstitutionId: string;
  totalAmount: number;
  comment: string;
  description: string;
  currency?: string;
  dailyLimit?: number;
}

export async function createTransferOperation(
  params: CreateOperationParams
): Promise<{ operation: TransferOperation; transactions: Transaction[] }> {
  const db = await getDb();
  const dailyLimit = params.dailyLimit || DAILY_LIMIT;
  const currency = params.currency || "CLP";

  const opRes = await db.query<TransferOperation>(
    `INSERT INTO transfer_operations
       (account_id, account_name, counterparty_holder_id, counterparty_holder_name,
        counterparty_account_number, counterparty_account_type, counterparty_institution_id,
        total_amount, currency, comment, description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      params.accountId,
      params.accountName,
      params.counterpartyHolderId,
      params.counterpartyHolderName,
      params.counterpartyAccountNumber,
      params.counterpartyAccountType,
      params.counterpartyInstitutionId,
      params.totalAmount,
      currency,
      params.comment,
      params.description,
    ]
  );
  const operation = opRes.rows[0];

  // Split into daily transactions
  const transactions: Transaction[] = [];
  let remaining = params.totalAmount;
  let dayOffset = 0;

  while (remaining > 0) {
    const chunk = Math.min(remaining, dailyLimit);
    const scheduledDate = new Date();
    scheduledDate.setDate(scheduledDate.getDate() + dayOffset);
    const dateStr = scheduledDate.toISOString().split("T")[0];

    const idempotencyKey = crypto.randomUUID();
    const txRes = await db.query<Transaction>(
      `INSERT INTO transactions (transfer_operation_id, amount, scheduled_date, status, idempotency_key)
       VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
      [operation.id, chunk, dateStr, idempotencyKey]
    );
    transactions.push(txRes.rows[0]);

    remaining -= chunk;
    dayOffset++;
  }

  return { operation, transactions };
}

export async function getOperationsWithDetails(): Promise<OperationWithDetails[]> {
  const db = await getDb();
  const res = await db.query<OperationWithDetails>(
    `SELECT * FROM transfer_operations ORDER BY created_at DESC`
  );

  const operations = res.rows;

  for (const op of operations) {
    const txRes = await db.query<Transaction>(
      "SELECT * FROM transactions WHERE transfer_operation_id = $1 ORDER BY scheduled_date, id",
      [op.id]
    );
    op.transactions = txRes.rows;
  }

  return operations;
}

export interface PendingTransactionRow extends Transaction {
  account_id: string;
  counterparty_holder_id: string;
  counterparty_holder_name: string;
  counterparty_account_number: string;
  counterparty_account_type: string;
  counterparty_institution_id: string;
  comment: string;
}

export async function getPendingTransactionsByAccount(
  accountId: string,
  date?: string
): Promise<PendingTransactionRow[]> {
  const db = await getDb();
  const targetDate = date || new Date().toISOString().split("T")[0];
  const res = await db.query<PendingTransactionRow>(
    `SELECT t.*, op.account_id, op.counterparty_holder_id, op.counterparty_holder_name,
            op.counterparty_account_number, op.counterparty_account_type,
            op.counterparty_institution_id, op.comment
     FROM transactions t
     JOIN transfer_operations op ON op.id = t.transfer_operation_id
     WHERE op.account_id = $1
       AND t.status = 'pending'
       AND t.scheduled_date <= $2
     ORDER BY t.scheduled_date, t.id`,
    [accountId, targetDate]
  );
  return res.rows;
}

export async function updateTransactionStatus(
  transactionId: number,
  status: string,
  fintocTransferId?: string
): Promise<void> {
  const db = await getDb();
  if (fintocTransferId) {
    await db.query(
      "UPDATE transactions SET status = $1, fintoc_transfer_id = $2 WHERE id = $3",
      [status, fintocTransferId, transactionId]
    );
  } else {
    await db.query("UPDATE transactions SET status = $1 WHERE id = $2", [status, transactionId]);
  }
}

export async function updateOperationStatus(operationId: number, status: string): Promise<void> {
  const db = await getDb();
  await db.query("UPDATE transfer_operations SET status = $1 WHERE id = $2", [status, operationId]);
}
