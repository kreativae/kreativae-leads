import { promisify } from "util";
import { randomBytes, scrypt as _scrypt, timingSafeEqual } from "crypto";

const scrypt = promisify(_scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

// OWASP-recommended scrypt parameters (min N=2^15) with memory headroom.
const N = 32768;
const R = 8;
const P = 2;
const KEYLEN = 64;
const MAXMEM = 256 * 1024 * 1024;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(32);
  const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const n = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  try {
    const derived = await scrypt(password.normalize("NFKC"), salt, KEYLEN, {
      N: n,
      r,
      p,
      maxmem: MAXMEM,
    });
    if (derived.length !== expected.length) return false;
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "qwerty123",
  "iloveyou",
  "admin123",
  "letmein123",
  "senha123",
  "senha1234",
  "kreativ123",
  "123mudar",
  "mudar123",
  "abc12345",
  "brasil123",
]);

export interface PasswordCheck {
  ok: boolean;
  score: number; // 0..4
  errors: string[];
}

export function checkPassword(password: string): PasswordCheck {
  const errors: string[] = [];
  const p = password ?? "";
  let score = 0;

  if (p.length < 10) errors.push("mínimo de 10 caracteres");
  else {
    score++;
    if (p.length >= 14) score++;
  }
  if (!/[a-zà-ú]/.test(p) || !/[A-ZÀ-Ú]/.test(p))
    errors.push("use letras maiúsculas e minúsculas");
  else score++;
  if (!/\d/.test(p)) errors.push("inclua pelo menos um número");
  else if (/[^A-Za-zÀ-ú0-9]/.test(p)) score++;
  if (COMMON_PASSWORDS.has(p.toLowerCase()))
    errors.push("senha muito comum — escolha outra");
  if (/^(.)\1{5,}$/.test(p)) errors.push("não repita o mesmo caractere");

  return { ok: errors.length === 0, score: Math.min(4, score), errors };
}
