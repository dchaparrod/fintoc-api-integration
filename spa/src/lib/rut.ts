/**
 * Chilean RUT (Rol Único Tributario) validation and formatting.
 *
 * Valid formats accepted: "12345678-5", "12.345.678-5", "123456785"
 * Stored format (clean): "123456785" (digits + check digit, no separators)
 */

/**
 * Remove dots and dashes, uppercase K.
 */
export function cleanRut(rut: string): string {
  return rut.replace(/[.\-\s]/g, "").toUpperCase();
}

/**
 * Compute the RUT check digit (dígito verificador).
 * Returns "0"-"9" or "K".
 */
export function computeCheckDigit(body: string): string {
  const digits = body.replace(/\D/g, "");
  let sum = 0;
  let mul = 2;
  for (let i = digits.length - 1; i >= 0; i--) {
    sum += parseInt(digits[i], 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return String(remainder);
}

/**
 * Validate a Chilean RUT string.
 * Accepts with or without dots/dashes.
 */
export function isValidRut(rut: string): boolean {
  const clean = cleanRut(rut);
  if (clean.length < 2) return false;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  // Body must be all digits, 1-8 digits
  if (!/^\d{1,8}$/.test(body)) return false;

  return computeCheckDigit(body) === dv;
}

/**
 * Format a RUT for display: "12.345.678-5"
 */
export function formatRut(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length < 2) return rut;

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);

  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${formatted}-${dv}`;
}

/**
 * Auto-format on input: adds dash before check digit.
 * Returns the cleaned value (no dots, just digits + optional K).
 */
export function formatRutInput(value: string): string {
  const clean = cleanRut(value);
  if (clean.length <= 1) return clean;

  const body = clean.slice(0, -1).replace(/\D/g, "");
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}
