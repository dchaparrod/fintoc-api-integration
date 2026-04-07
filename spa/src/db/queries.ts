import { getDb } from "./index";
import type {
  Client,
  ClientCounterparty,
  TransferOperation,
  Transaction,
  OperationWithDetails,
} from "@/lib/types";

const DAILY_LIMIT = 7_000_000;

// ── Clients ──────────────────────────────────────────────

export async function getClients(): Promise<Client[]> {
  const db = await getDb();
  const res = await db.query<Client>("SELECT * FROM clients ORDER BY id");
  return res.rows;
}

export async function getClientById(id: number): Promise<Client | null> {
  const db = await getDb();
  const res = await db.query<Client>("SELECT * FROM clients WHERE id = $1", [id]);
  return res.rows[0] ?? null;
}

// ── Counterparties ───────────────────────────────────────

export async function getCounterpartiesByClient(clientId: number): Promise<ClientCounterparty[]> {
  const db = await getDb();
  const res = await db.query<ClientCounterparty>(
    "SELECT * FROM client_counterparties WHERE client_id = $1 ORDER BY id",
    [clientId]
  );
  return res.rows;
}

// ── Transfer Operations ──────────────────────────────────

export async function createTransferOperation(
  clientId: number,
  counterpartyId: number,
  totalAmount: number,
  comment: string,
  description: string,
  currency: string = "CLP"
): Promise<{ operation: TransferOperation; transactions: Transaction[] }> {
  const db = await getDb();
  const client = await getClientById(clientId);
  if (!client) throw new Error("Client not found");

  const dailyLimit = client.daily_limit || DAILY_LIMIT;

  // Create the operation
  const opRes = await db.query<TransferOperation>(
    `INSERT INTO transfer_operations (client_id, client_counterparty_id, total_amount, currency, comment, description)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [clientId, counterpartyId, totalAmount, currency, comment, description]
  );
  const operation = opRes.rows[0];

  // Split into transactions
  const transactions: Transaction[] = [];
  let remaining = totalAmount;
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
    `SELECT
       op.*,
       c.name AS client_name,
       c.rut AS client_rut,
       cc.holder_name AS counterparty_name
     FROM transfer_operations op
     JOIN clients c ON c.id = op.client_id
     JOIN client_counterparties cc ON cc.id = op.client_counterparty_id
     ORDER BY op.created_at DESC`
  );

  const operations = res.rows;

  // Attach transactions to each operation
  for (const op of operations) {
    const txRes = await db.query<Transaction>(
      "SELECT * FROM transactions WHERE transfer_operation_id = $1 ORDER BY scheduled_date, id",
      [op.id]
    );
    op.transactions = txRes.rows;
  }

  return operations;
}

export async function getTransactionsByOperation(operationId: number): Promise<Transaction[]> {
  const db = await getDb();
  const res = await db.query<Transaction>(
    "SELECT * FROM transactions WHERE transfer_operation_id = $1 ORDER BY scheduled_date, id",
    [operationId]
  );
  return res.rows;
}

export async function getPendingTransactionsByClient(
  clientId: number,
  date?: string
): Promise<Transaction[]> {
  const db = await getDb();
  const targetDate = date || new Date().toISOString().split("T")[0];
  const res = await db.query<Transaction>(
    `SELECT t.* FROM transactions t
     JOIN transfer_operations op ON op.id = t.transfer_operation_id
     WHERE op.client_id = $1
       AND t.status = 'pending'
       AND t.scheduled_date <= $2
     ORDER BY t.scheduled_date, t.id`,
    [clientId, targetDate]
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
