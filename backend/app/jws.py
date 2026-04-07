import base64
import json
import time
import secrets
import os
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import serialization


PRIVATE_KEY_PATH = os.getenv("FINTOC_PRIVATE_KEY_PATH", os.path.expanduser("~/.ssh/fintoc_private.pem"))


def _load_private_key():
    with open(PRIVATE_KEY_PATH, "rb") as f:
        return serialization.load_pem_private_key(f.read(), password=None)


def generate_jws_signature_header(raw_body: str) -> str:
    """
    Generate a JWS signature header for Fintoc API requests.
    Returns the value for the 'Fintoc-JWS-Signature' header.
    """
    private_key = _load_private_key()

    headers = {
        "alg": "RS256",
        "nonce": secrets.token_hex(16),
        "ts": int(time.time()),
        "crit": ["ts", "nonce"],
    }

    protected_base64 = (
        base64.urlsafe_b64encode(json.dumps(headers).encode()).rstrip(b"=").decode()
    )

    payload_base64 = (
        base64.urlsafe_b64encode(raw_body.encode()).rstrip(b"=").decode()
    )

    signing_input = f"{protected_base64}.{payload_base64}"

    signature_raw = private_key.sign(
        signing_input.encode(),
        padding.PKCS1v15(),
        hashes.SHA256(),
    )

    signature_base64 = (
        base64.urlsafe_b64encode(signature_raw).rstrip(b"=").decode()
    )

    return f"{protected_base64}.{signature_base64}"
