// Password hashing and one-time codes (D-043). Node's built-in scrypt: memory-hard, no native
// dependency. Codes are random 6-digit numbers; only an HMAC of the code is stored.

import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
  type BinaryLike,
  type ScryptOptions,
} from "node:crypto";
import { CODE_LENGTH } from "@/lib/auth/credentials";

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function scryptAsync(
  password: BinaryLike,
  salt: BinaryLike,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, options, (error, key) =>
      error ? reject(error) : resolve(key),
    ),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password.normalize("NFKC"), salt, {
    N,
    r: R,
    p: P,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const key = await scryptAsync(password.normalize("NFKC"), Buffer.from(salt, "base64"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 64 * 1024 * 1024,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** A hash to compare against when there is no user, so failed sign-ins take the same time. */
export const DUMMY_HASH =
  "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, "0");
}

export function hashCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(`code:${code}`).digest("hex");
}

export function codeMatches(code: string, codeHash: string, secret: string): boolean {
  const a = Buffer.from(hashCode(code, secret), "hex");
  const b = Buffer.from(codeHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
