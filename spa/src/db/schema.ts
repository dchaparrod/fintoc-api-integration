export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS clients (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  rut TEXT NOT NULL,
  account_id TEXT NOT NULL,
  daily_limit INTEGER NOT NULL DEFAULT 7000000
);

CREATE TABLE IF NOT EXISTS client_counterparties (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  holder_id TEXT NOT NULL,
  holder_name TEXT NOT NULL,
  account_number TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('checking_account', 'sight_account')),
  institution_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transfer_operations (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  client_counterparty_id INTEGER NOT NULL REFERENCES client_counterparties(id),
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

CREATE TABLE IF NOT EXISTS daily_execution_log (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  execution_date DATE NOT NULL,
  total_executed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
);
`;

export const SEED_SQL = `
INSERT INTO clients (name, rut, account_id, daily_limit)
SELECT 'Empresa Alpha SpA', '76.123.456-7', 'acc_M8sKf230BgHjD4', 7000000
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE rut = '76.123.456-7');

INSERT INTO clients (name, rut, account_id, daily_limit)
SELECT 'Inversiones Beta Ltda', '77.654.321-0', 'acc_N9tLg341CiIkE5', 7000000
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE rut = '77.654.321-0');

INSERT INTO clients (name, rut, account_id, daily_limit)
SELECT 'Servicios Gamma SA', '78.987.654-3', 'acc_O0uMh452DjJlF6', 7000000
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE rut = '78.987.654-3');

INSERT INTO client_counterparties (client_id, holder_id, holder_name, account_number, account_type, institution_id)
SELECT 1, '771433855', 'Piped Piper SpA', '502955923', 'checking_account', 'cl_banco_de_chile'
WHERE NOT EXISTS (SELECT 1 FROM client_counterparties WHERE holder_id = '771433855' AND client_id = 1);

INSERT INTO client_counterparties (client_id, holder_id, holder_name, account_number, account_type, institution_id)
SELECT 1, '123456789', 'Hooli Inc', '301234567', 'checking_account', 'cl_banco_santander'
WHERE NOT EXISTS (SELECT 1 FROM client_counterparties WHERE holder_id = '123456789' AND client_id = 1);

INSERT INTO client_counterparties (client_id, holder_id, holder_name, account_number, account_type, institution_id)
SELECT 2, '987654321', 'Raviga Capital', '701987654', 'sight_account', 'cl_banco_estado'
WHERE NOT EXISTS (SELECT 1 FROM client_counterparties WHERE holder_id = '987654321' AND client_id = 2);

INSERT INTO client_counterparties (client_id, holder_id, holder_name, account_number, account_type, institution_id)
SELECT 3, '456789012', 'Bachmanity LLC', '901456789', 'checking_account', 'cl_banco_bci'
WHERE NOT EXISTS (SELECT 1 FROM client_counterparties WHERE holder_id = '456789012' AND client_id = 3);
`;
