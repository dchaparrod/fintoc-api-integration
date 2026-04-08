"""
Chilean RUT (Rol Único Tributario) validation.

Valid formats: "12345678-5", "12.345.678-5", "123456785"
Clean format (stored): "123456785"
"""

import re


def clean_rut(rut: str) -> str:
    """Remove dots, dashes, and spaces; uppercase K."""
    return re.sub(r"[.\-\s]", "", rut).upper()


def compute_check_digit(body: str) -> str:
    """Compute RUT check digit (dígito verificador)."""
    digits = re.sub(r"\D", "", body)
    total = 0
    mul = 2
    for ch in reversed(digits):
        total += int(ch) * mul
        mul = 2 if mul == 7 else mul + 1
    remainder = 11 - (total % 11)
    if remainder == 11:
        return "0"
    if remainder == 10:
        return "K"
    return str(remainder)


def is_valid_rut(rut: str) -> bool:
    """Validate a Chilean RUT string."""
    clean = clean_rut(rut)
    if len(clean) < 2:
        return False

    body = clean[:-1]
    dv = clean[-1]

    if not re.match(r"^\d{1,8}$", body):
        return False

    return compute_check_digit(body) == dv


def format_rut(rut: str) -> str:
    """Format a RUT for display: 12.345.678-5"""
    clean = clean_rut(rut)
    if len(clean) < 2:
        return rut
    body = clean[:-1]
    dv = clean[-1]
    # Add dots every 3 digits from right
    formatted = ""
    for i, ch in enumerate(reversed(body)):
        if i > 0 and i % 3 == 0:
            formatted = "." + formatted
        formatted = ch + formatted
    return f"{formatted}-{dv}"
