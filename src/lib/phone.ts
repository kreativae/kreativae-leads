export function digitsOnly(v: string): string {
  return v.replace(/\D+/g, "");
}

function stripCountry(digits: string, country: string): string {
  let d = digits;
  if (d.startsWith("00")) d = d.slice(2);
  if (country === "PT") {
    if (d.startsWith("351") && d.length > 9) return d.slice(3);
    return d;
  }
  if (d.startsWith("55") && d.length >= 12) return d.slice(2);
  return d;
}

/** Detects whether the number looks like a mobile/cell number for the country. */
export function isMobileNumber(
  raw: string | null | undefined,
  country: string,
): boolean {
  if (!raw) return false;
  const d = stripCountry(digitsOnly(raw), country);
  if (country === "PT") {
    // PT mobiles: 9 digits starting with 9 (91/92/93/96)
    return d.length === 9 && d.startsWith("9");
  }
  // BR mobiles: DDD(2) + 9 digits starting with 9
  return d.length === 11 && d[2] === "9";
}

/** Returns digits ready for wa.me (country code included) or null if not a mobile. */
/**
 * Formata para digitos com codigo do pais SEM exigir formato de celular.
 * Use quando a empresa declarou o numero como WhatsApp (tag contact:whatsapp
 * ou link wa.me no site): muita empresa usa fixo no WhatsApp Business, e a
 * declaracao dela vale mais que o formato do numero.
 */
export function toWhatsappDigits(
  raw: string | null | undefined,
  country: string,
): string | null {
  if (!raw) return null;
  const d0 = digitsOnly(raw);
  if (d0.length < 8 || d0.length > 15) return null;
  if (country === "PT") {
    let d = d0;
    if (d.startsWith("00")) d = d.slice(2);
    if (d.startsWith("351")) return d;
    return "351" + d;
  }
  const d = stripCountry(d0, "BR");
  return "55" + d;
}

/** So aceita numeros com cara de celular — usado quando nao ha declaracao. */
export function whatsappDigits(
  raw: string | null | undefined,
  country: string,
): string | null {
  if (!raw) return null;
  if (!isMobileNumber(raw, country)) return null;
  return toWhatsappDigits(raw, country);
}

export function formatPhone(
  raw: string | null | undefined,
  country: string,
): string | null {
  if (!raw) return null;
  const d = stripCountry(digitsOnly(raw), country);
  if (country === "PT") {
    if (d.length === 9)
      return `+351 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
    return raw;
  }
  if (d.length === 11) {
    return `+55 (${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `+55 (${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return raw;
}
