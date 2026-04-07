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

export const SEED_SQL = `
-- ── Operation 1: Small transfer (single transaction, already succeeded) ──
INSERT INTO transfer_operations
  (account_id, account_name, counterparty_holder_id, counterparty_holder_name,
   counterparty_account_number, counterparty_account_type, counterparty_institution_id,
   total_amount, currency, comment, description, status, created_at)
SELECT 'acc_demo_001', 'Cuenta Corriente Empresa Alpha', '771433855', 'Piped Piper SpA',
       '502955923', 'checking_account', 'cl_banco_de_chile',
       3500000, 'CLP', 'Pago factura #1021', 'Pago mensual proveedor', 'completed',
       NOW() - INTERVAL '3 days'
WHERE NOT EXISTS (SELECT 1 FROM transfer_operations WHERE comment = 'Pago factura #1021');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, fintoc_transfer_id, idempotency_key, created_at)
SELECT 1, 3500000, CURRENT_DATE - 3, 'succeeded', 'trx_abc123def456', gen_random_uuid()::text,
       NOW() - INTERVAL '3 days'
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE fintoc_transfer_id = 'trx_abc123def456');

-- ── Operation 2: Large transfer (split into 3 days, 2 succeeded, 1 pending) ──
INSERT INTO transfer_operations
  (account_id, account_name, counterparty_holder_id, counterparty_holder_name,
   counterparty_account_number, counterparty_account_type, counterparty_institution_id,
   total_amount, currency, comment, description, status, created_at)
SELECT 'acc_demo_001', 'Cuenta Corriente Empresa Alpha', '123456789', 'Hooli Inc',
       '301234567', 'checking_account', 'cl_banco_santander',
       18500000, 'CLP', 'Liquidacion Q1 2026', 'Pago trimestral consultoria', 'in_progress',
       NOW() - INTERVAL '2 days'
WHERE NOT EXISTS (SELECT 1 FROM transfer_operations WHERE comment = 'Liquidacion Q1 2026');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, fintoc_transfer_id, idempotency_key, created_at)
SELECT 2, 7000000, CURRENT_DATE - 2, 'succeeded', 'trx_day1_aaa111', gen_random_uuid()::text,
       NOW() - INTERVAL '2 days'
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE fintoc_transfer_id = 'trx_day1_aaa111');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, fintoc_transfer_id, idempotency_key, created_at)
SELECT 2, 7000000, CURRENT_DATE - 1, 'succeeded', 'trx_day2_bbb222', gen_random_uuid()::text,
       NOW() - INTERVAL '1 day'
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE fintoc_transfer_id = 'trx_day2_bbb222');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, idempotency_key, created_at)
SELECT 2, 4500000, CURRENT_DATE, 'pending', gen_random_uuid()::text,
       NOW() - INTERVAL '2 days'
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE transfer_operation_id = 2 AND amount = 4500000 AND status = 'pending');

-- ── Operation 3: Medium transfer (pending, scheduled for today) ──
INSERT INTO transfer_operations
  (account_id, account_name, counterparty_holder_id, counterparty_holder_name,
   counterparty_account_number, counterparty_account_type, counterparty_institution_id,
   total_amount, currency, comment, description, status, created_at)
SELECT 'acc_demo_002', 'Cuenta Vista Inversiones Beta', '987654321', 'Raviga Capital',
       '701987654', 'sight_account', 'cl_banco_estado',
       5000000, 'CLP', 'Distribucion utilidades', 'Reparto socios marzo', 'pending',
       NOW() - INTERVAL '1 day'
WHERE NOT EXISTS (SELECT 1 FROM transfer_operations WHERE comment = 'Distribucion utilidades');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, idempotency_key, created_at)
SELECT 3, 5000000, CURRENT_DATE, 'pending', gen_random_uuid()::text,
       NOW() - INTERVAL '1 day'
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE transfer_operation_id = 3 AND status = 'pending');

-- ── Operation 4: Failed transfer ──
INSERT INTO transfer_operations
  (account_id, account_name, counterparty_holder_id, counterparty_holder_name,
   counterparty_account_number, counterparty_account_type, counterparty_institution_id,
   total_amount, currency, comment, description, status, created_at)
SELECT 'acc_demo_001', 'Cuenta Corriente Empresa Alpha', '456789012', 'Bachmanity LLC',
       '901456789', 'checking_account', 'cl_banco_bci',
       2000000, 'CLP', 'Pago servicio cloud', 'AWS infra Q1', 'failed',
       NOW() - INTERVAL '5 days'
WHERE NOT EXISTS (SELECT 1 FROM transfer_operations WHERE comment = 'Pago servicio cloud');

INSERT INTO transactions
  (transfer_operation_id, amount, scheduled_date, status, idempotency_key, created_at)
SELECT 4, 2000000, CURRENT_DATE - 5, 'failed', gen_random_uuid()::text,
       NOW() - INTERVAL '5 days'
WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE transfer_operation_id = 4 AND status = 'failed');
`;
