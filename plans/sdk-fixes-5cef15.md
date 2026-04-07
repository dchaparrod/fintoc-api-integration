# Fix Fintoc SDK Usage

Align our backend with the official Python SDK patterns — pass JWS key to client, use native simulate method, fix deprecated `.all()` calls, remove httpx.

## Issues Found

1. **Client init missing JWS key**: SDK handles JWS automatically when initialized with `jws_private_key`:
   ```python
   client = Fintoc("api_key", jws_private_key="private_key.pem")
   ```
2. **`.all()` is deprecated**: SDK uses `.list()` not `.all()`
3. **Simulate is in the SDK**: `client.v2.simulate.receive_transfer(...)` — no need for httpx
4. **Manual JWS generation in `execute_transfer`**: Unnecessary since SDK handles it when initialized with the key

## Changes

### 1. `fintoc_client.py`
- Update `_get_client()` to pass `jws_private_key=FINTOC_PRIVATE_KEY_PATH`
- Replace `client.v2.accounts.all()` → `client.v2.accounts.list()`
- Replace httpx `simulate_receive_transfer()` with `client.v2.simulate.receive_transfer()`
- Remove manual JWS signature generation from `execute_transfer()`
- Remove `import httpx`

### 2. `requirements.txt`
- Remove `httpx` dependency

### 3. `jws.py`
- Keep file for now (may be useful later for custom calls), but it's no longer called

### 4. `main.py`
- Remove unused `generate_jws_signature_header` import if present
