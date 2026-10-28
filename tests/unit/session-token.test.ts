import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "@/server/auth/session-token";

const SECRET = "test-secret-that-is-at-least-32-characters-long";

describe("session tokens", () => {
  it("round-trips the user and session ids", async () => {
    const token = await signSessionToken({ userId: "user_123", sessionId: "sess_1" }, SECRET);
    await expect(verifySessionToken(token, SECRET)).resolves.toEqual({
      userId: "user_123",
      sessionId: "sess_1",
    });
  });

  it("rejects a token signed with another secret", async () => {
    const token = await signSessionToken({ userId: "user_123", sessionId: "sess_1" }, SECRET);
    await expect(verifySessionToken(token, `${SECRET}-other`)).resolves.toBeNull();
  });

  it("rejects a tampered token", async () => {
    const token = await signSessionToken({ userId: "user_123", sessionId: "sess_1" }, SECRET);
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "admin" })).toString("base64url");
    await expect(
      verifySessionToken(`${header}.${forgedPayload}.${signature}`, SECRET),
    ).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const expired = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_123")
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifySessionToken(expired, SECRET)).resolves.toBeNull();
  });

  it("rejects a token without a session id (pre-Phase 6 cookies)", async () => {
    const old = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_123")
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(SECRET));
    await expect(verifySessionToken(old, SECRET)).resolves.toBeNull();
  });

  it("rejects missing and malformed tokens", async () => {
    await expect(verifySessionToken(undefined, SECRET)).resolves.toBeNull();
    await expect(verifySessionToken("not-a-jwt", SECRET)).resolves.toBeNull();
  });
});
