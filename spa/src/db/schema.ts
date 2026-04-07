export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS transfer_operations (
  id SERIAL PRIMARY KEY,
  account_id TEXT NOT NULL,
  account_name TEXT NOT NULL DEFAULT '',
  counterparty_holder_id TEXT NOT NULL,
  counterparty_holder_name TEXT NOT NULL,
  counterparty_account_number TEXT NOT NULL,
  counterparty_account_type TEXT NOT NULL,
  counterparty_institution_id TEXT NOT NULL,
  total_amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CLP',
  comment TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed'))
);

CREATE TABLE IF NOT EXISTS transactions (
  id SERIAL PRIMARY KEY,
  transfer_operation_id INTEGER NOT NULL REFERENCES transfer_operations(id),
  amount INTEGER NOT NULL,
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'rejected')),
  fintoc_transfer_id TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

// No seed data needed — accounts and counterparties come from Fintoc API
