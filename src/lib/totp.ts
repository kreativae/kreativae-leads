import {
  generateSecret,
  generateSync,
  generateURI,
  verifySync,
} from "otplib/functional";

const ISSUER = "kreativ.ae Radar";
const EPOCH_TOLERANCE = 30; // accepts ±1 time step (clock drift)

export async function newTotpSecret(): Promise<string> {
  return generateSecret();
}

export function totpUri(secret: string, email: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret, strategy: "totp" });
}

export function verifyTotp(secret: string, token: string): boolean {
  if (!/^\d{6}$/.test(token)) return false;
  try {
    const result = verifySync({
      token,
      secret,
      strategy: "totp",
      epochTolerance: EPOCH_TOLERANCE,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

/** Used only in diagnostics/tests. */
export function currentToken(secret: string): string {
  return generateSync({ secret, strategy: "totp" });
}
