/**
 * Phone number normalization and matching helpers.
 * WhatsApp Business Cloud sends numbers as digits with country code and no
 * leading "+", e.g. "919876543210". Users may register with any common format.
 */

export function normalizePhone(input: string): string {
  let digits = input.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }
  // A leading 0 before a country code is a trunk prefix; drop it once.
  if (digits.startsWith("0") && digits.length > 10) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    // Assume an Indian number when a bare 10-digit value is supplied.
    digits = `91${digits}`;
  }
  return digits;
}

export function phonesMatch(a: string, b: string): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) {
    return false;
  }
  // Match when equal, or when one is a suffix of the other (e.g. the user
  // stored "9876543210" and WhatsApp sent "919876543210").
  return na === nb || na.endsWith(nb) || nb.endsWith(na);
}

export function formatPhoneDisplay(phone: string): string {
  const n = normalizePhone(phone);
  if (n.length === 12 && n.startsWith("91")) {
    return `+91 ${n.slice(2, 7)} ${n.slice(7)}`;
  }
  return `+${n}`;
}
