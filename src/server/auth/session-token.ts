// Signed session tokens (HS256 JWT). Shared by the auth module and proxy.ts, so no `server-only`.
// The token names a row in `sessions` (D-043): proxy.ts only checks the signature (fast,
// optimistic); src/server/auth checks the row is still valid on every request.

import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export type SessionPayload = { userId: string; sessionId: string };

function key(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload, secret: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setJti(payload.sessionId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(key(secret));
}

/** Returns the payload, or null for a missing, tampered or expired token. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(secret), { algorithms: ["HS256"] });
    return payload.sub && payload.jti ? { userId: payload.sub, sessionId: payload.jti } : null;
  } catch {
    return null;
  }
}
