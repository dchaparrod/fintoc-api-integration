export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS saved_counterparties (
  id SERIAL PRIMARY KEY,
  holder_id TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'checking_account',
  institution_id TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed', 'rejected', 'returned', 'return_pending')),
  fintoc_transfer_id TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
`;

export const SEED_SQL = `
-- ── Saved Counterparties (address book) — all RUTs validated ──
INSERT INTO saved_counterparties (holder_id, holder_name, account_number, account_type, institution_id)
SELECT '771433855', 'Piped Piper SpA', '502955923', 'checking_account', 'cl_banco_de_chile'
WHERE NOT EXISTS (SELECT 1 FROM saved_counterparties WHERE holder_id = '771433855');

INSERT INTO saved_counterparties (holder_id, holder_name, account_number, account_type, institution_id)
SELECT '123456785', 'Hooli Inc', '301234567', 'checking_account', 'cl_banco_santander'
WHERE NOT EXISTS (SELECT 1 FROM saved_counterparties WHERE holder_id = '123456785');

INSERT INTO saved_counterparties (holder_id, holder_name, account_number, account_type, institution_id)
SELECT '987654325', 'Raviga Capital', '701987654', 'sight_account', 'cl_banco_estado'
WHERE NOT EXISTS (SELECT 1 FROM saved_counterparties WHERE holder_id = '987654325');

INSERT INTO saved_counterparties (holder_id, holder_name, account_number, account_type, institution_id)
SELECT '456789013', 'Bachmanity LLC', '901456789', 'checking_account', 'cl_banco_bci'
WHERE NOT EXISTS (SELECT 1 FROM saved_counterparties WHERE holder_id = '456789013');
`;

export const MIGRATION_SQL = `
-- v3: Expand transaction status constraint to include Fintoc intermediate statuses
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'transactions_status_check'
  ) THEN
    ALTER TABLE transactions DROP CONSTRAINT transactions_status_check;
    ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
      CHECK (status IN ('pending', 'succeeded', 'failed', 'rejected', 'returned', 'return_pending'));
  END IF;
END $$;
`;
