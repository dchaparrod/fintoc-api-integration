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
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'pending_confirmation', 'succeeded', 'failed', 'rejected')),
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

-- ── Operation 1: Small transfer (single tx, succeeded today) ──
INSERT INTO transfer_operations
  (account_id, account_name, counterparty_holder_id, counterparty_holder_name,
   counterparty_account_number, counterparty_account_type, counterparty_institution_id,
   total_amount, currency, comment, description, status, created_at)
SELECT 'acc_demo_001', 'Cuenta Corriente Empresa Alpha', '771433855', 'Piped Piper SpA',
       '502955923', 'checking_account', 'cl_banco_de_chile',
       3500000, 'CLP', 'Pago factura #1021', 'Pago mensual proveedor', 'completed',
       NOW()
WHERE NOT EXISTS (SELECT 1 FROM transfer_operations WHERE comment = 'Pago factura #1021');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, fintoc_transfer_id, idempotency_key, created_at)
SELECT o.id, 3500000, CURRENT_DATE, 'succeeded', 'trx_seed_op1', gen_random_uuid()::text, NOW()
FROM transfer_operations o WHERE o.comment = 'Pago factura #1021'
  AND NOT EXISTS (SELECT 1 FROM transactions WHERE fintoc_transfer_id = 'trx_seed_op1');

-- ── Operation 2: Large split transfer (3 txs today, all succeeded = completed) ──
INSERT INTO transfer_operations
  (account_id, account_name, counterparty_holder_id, counterparty_holder_name,
   counterparty_account_number, counterparty_account_type, counterparty_institution_id,
   total_amount, currency, comment, description, status, created_at)
SELECT 'acc_demo_001', 'Cuenta Corriente Empresa Alpha', '123456785', 'Hooli Inc',
       '301234567', 'checking_account', 'cl_banco_santander',
       18500000, 'CLP', 'Liquidacion Q1 2026', 'Pago trimestral consultoria', 'completed',
       NOW()
WHERE NOT EXISTS (SELECT 1 FROM transfer_operations WHERE comment = 'Liquidacion Q1 2026');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, fintoc_transfer_id, idempotency_key, created_at)
SELECT o.id, 7000000, CURRENT_DATE, 'succeeded', 'trx_seed_op2d1', gen_random_uuid()::text, NOW()
FROM transfer_operations o WHERE o.comment = 'Liquidacion Q1 2026'
  AND NOT EXISTS (SELECT 1 FROM transactions WHERE fintoc_transfer_id = 'trx_seed_op2d1');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, fintoc_transfer_id, idempotency_key, created_at)
SELECT o.id, 7000000, CURRENT_DATE, 'succeeded', 'trx_seed_op2d2', gen_random_uuid()::text, NOW()
FROM transfer_operations o WHERE o.comment = 'Liquidacion Q1 2026'
  AND NOT EXISTS (SELECT 1 FROM transactions WHERE fintoc_transfer_id = 'trx_seed_op2d2');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, fintoc_transfer_id, idempotency_key, created_at)
SELECT o.id, 4500000, CURRENT_DATE, 'succeeded', 'trx_seed_op2d3', gen_random_uuid()::text, NOW()
FROM transfer_operations o WHERE o.comment = 'Liquidacion Q1 2026'
  AND NOT EXISTS (SELECT 1 FROM transactions WHERE fintoc_transfer_id = 'trx_seed_op2d3');

-- ── Operation 3: Medium transfer (pending, scheduled for today) ──
INSERT INTO transfer_operations
  (account_id, account_name, counterparty_holder_id, counterparty_holder_name,
   counterparty_account_number, counterparty_account_type, counterparty_institution_id,
   total_amount, currency, comment, description, status, created_at)
SELECT 'acc_demo_002', 'Cuenta Vista Inversiones Beta', '987654325', 'Raviga Capital',
       '701987654', 'sight_account', 'cl_banco_estado',
       5000000, 'CLP', 'Distribucion utilidades', 'Reparto socios marzo', 'pending',
       NOW()
WHERE NOT EXISTS (SELECT 1 FROM transfer_operations WHERE comment = 'Distribucion utilidades');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, idempotency_key, created_at)
SELECT o.id, 5000000, CURRENT_DATE, 'pending', gen_random_uuid()::text, NOW()
FROM transfer_operations o WHERE o.comment = 'Distribucion utilidades'
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.transfer_operation_id = o.id);

-- ── Operation 4: Failed transfer (today) ──
INSERT INTO transfer_operations
  (account_id, account_name, counterparty_holder_id, counterparty_holder_name,
   counterparty_account_number, counterparty_account_type, counterparty_institution_id,
   total_amount, currency, comment, description, status, created_at)
SELECT 'acc_demo_001', 'Cuenta Corriente Empresa Alpha', '456789013', 'Bachmanity LLC',
       '901456789', 'checking_account', 'cl_banco_bci',
       2000000, 'CLP', 'Pago servicio cloud', 'AWS infra Q1', 'failed',
       NOW()
WHERE NOT EXISTS (SELECT 1 FROM transfer_operations WHERE comment = 'Pago servicio cloud');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, idempotency_key, created_at)
SELECT o.id, 2000000, CURRENT_DATE, 'failed', gen_random_uuid()::text, NOW()
FROM transfer_operations o WHERE o.comment = 'Pago servicio cloud'
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.transfer_operation_id = o.id);
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
      CHECK (status IN ('pending', 'processing', 'pending_confirmation', 'succeeded', 'failed', 'rejected'));
  END IF;
END $$;
`;
