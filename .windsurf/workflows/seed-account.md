---
description: Seed a Fintoc test account with funds to enable transfers
---

# Seed Account & Simulate Funds

This workflow creates/verifies a Fintoc test account and simulates an inbound transfer so the account has funds available for outbound transfers.

## Prerequisites

- Docker container running (`docker compose up -d`)
- Valid `sk_test_...` secret key in `.env` as `FINTOC_API_KEY`
- JWS private key configured in Fintoc dashboard and mounted at `FINTOC_PRIVATE_KEY_PATH`

## Steps

1. Verify the backend is healthy:
// turbo
```bash
curl -s http://localhost:8000/api/health
```
Expected: `{"status":"ok"}`

2. List active accounts and find the `root_account_number_id`:
// turbo
```bash
curl -s http://localhost:8000/api/accounts | python3 -m json.tool
```
Note the `root_account_number_id` value (e.g. `acno_XXXX...`).

3. Simulate receiving an inbound transfer to fund the account (adjust `account_number_id` and `amount` as needed):
```bash
curl -s -X POST http://localhost:8000/api/simulate/receive-transfer \
  -H "Content-Type: application/json" \
  -d '{"account_number_id": "<ACCOUNT_NUMBER_ID>", "amount": 50000000, "currency": "CLP"}'
```
Expected: JSON response with `"status": "succeeded"` and the transfer details.

4. Verify the balance was updated:
// turbo
```bash
curl -s http://localhost:8000/api/accounts | python3 -m json.tool
```
The `balance` field should now reflect the deposited amount.
