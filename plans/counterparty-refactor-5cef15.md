# Counterparty Refactor & Simulate Endpoint

Remove the fake counterparty CRUD (no such Fintoc API resource), save counterparty details locally in PGlite as a "saved accounts" address book, and add the simulate-receive-transfer endpoint for test funding.

## Context from Fintoc API

- **Accounts** (`/v2/accounts`): YOUR Fintoc accounts (source of funds). SDK supports `list`/`get`/`create`/`update`.
- **Counterparties**: NOT a separate resource. They're inline objects in the transfer body:
  ```json
  "counterparty": {
    "holder_id": "771433855",
    "holder_name": "Piped Piper SpA",
    "account_number": "502955923",
    "account_type": "checking_account",
    "institution_id": "cl_banco_de_chile"
  }
  ```
- **Simulate receive transfer** (`POST /v1/simulate/receive-transfer`): funds a test account so you can create outbound transfers.

## Plan

### 1. Backend: remove counterparty CRUD, add simulate endpoint
- **Remove** from `fintoc_client.py`: `list_counterparties`, `get_counterparty`, `create_counterparty`, `delete_counterparty` and all httpx counterparty code
- **Remove** from `main.py`: all `/api/counterparties` endpoints
- **Remove** from `schemas.py`: `CreateCounterpartyRequest`
- **Remove** `httpx` from `requirements.txt` (unless needed for simulate)
- **Add** to `fintoc_client.py`: `simulate_receive_transfer(account_number_id, amount, currency)` using httpx (or SDK `client.v2.simulate`)
- **Add** to `main.py`: `POST /api/simulate/receive-transfer` endpoint

### 2. PGlite: add `saved_counterparties` table
- Add to `schema.ts` a `saved_counterparties` table:
  ```sql
  CREATE TABLE IF NOT EXISTS saved_counterparties (
    id SERIAL PRIMARY KEY,
    holder_id TEXT NOT NULL,
    holder_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_type TEXT NOT NULL,
    institution_id TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  );
  ```
- Add seed data with 3-4 example counterparties
- Add queries in `queries.ts`: `listSavedCounterparties`, `createSavedCounterparty`, `deleteSavedCounterparty`

### 3. SPA: update types
- Remove `FintocCounterparty` type (was for a non-existent API)
- Add `SavedCounterparty` type (local PGlite record)

### 4. SPA: update CounterpartiesPage
- Rename to a "Saved Accounts" page managing local PGlite `saved_counterparties`
- List / Create / Delete from PGlite (no backend calls for counterparties)
- Form: holder_id, holder_name, account_number, account_type, institution_id (use institutions from backend)

### 5. SPA: update TransferPage
- Load counterparties from PGlite `saved_counterparties` instead of backend API
- Keep the existing form flow (select account from API, select counterparty from local, enter amount)

### 6. SPA: remove counterparty API functions
- Remove `fetchCounterparties`, `createCounterparty`, `deleteCounterparty` from `api.ts`

### 7. Backend: add simulate endpoint for test funding
- `POST /api/simulate/receive-transfer` with body `{ account_number_id, amount, currency }`
- Calls Fintoc simulate endpoint to deposit funds into the test account
- Optional: add a "Fund Account" button somewhere in the SPA for dev/test convenience

### 8. Verify & rebuild
- SPA `vite build` clean
- Docker `compose build` + `compose up` clean
- Test `/api/health`, `/api/accounts`, `/api/institutions`, `/api/simulate/receive-transfer`
