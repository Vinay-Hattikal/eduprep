// Accounts end to end (D-043): email sign-up with a verification code, password sign-in,
// phone OTP sign-in, password reset, rate limits and code safety. Codes are read from the dev
// outbox, as a person would read them from their inbox or phone.

import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import {
  changePassword,
  requestPasswordReset,
  requestPhoneCode,
  resendVerification,
  resetPassword,
  signInWithPassword,
  signUp,
  verifyEmail,
  verifyPhoneCode,
} from "@/server/services/accounts";
import { resetDatabase } from "./helpers";

let ip = 0;
/** A fresh IP per test so per-IP limits don't leak between tests. */
const nextIp = () => `10.0.0.${++ip}`;

async function lastCode(to: string): Promise<string> {
  const message = await db.notification.findFirstOrThrow({
    where: { to, template: "auth.code" },
    orderBy: { createdAt: "desc" },
  });
  const code = /\b(\d{6})\b/.exec(message.body)?.[1];
  if (!code) throw new Error(`no code in: ${message.body}`);
  return code;
}

beforeEach(async () => {
  await resetDatabase();
});

describe("email sign-up", () => {
  it("creates an unverified account, verifies it with the emailed code, then signs in", async () => {
    const created = await signUp(
      { name: "Ravi Kumar", email: " Ravi@Example.com ", password: "blue-river-42" },
      nextIp(),
    );
    expect(created).toEqual({ ok: true, email: "ravi@example.com" });
    const user = await db.user.findUniqueOrThrow({
      where: { email: "ravi@example.com" },
      include: { password: true },
    });
    expect(user.emailVerified).toBe(false);
    expect(user.password?.passwordHash).toMatch(/^scrypt\$/);
    expect(user.roles).toEqual(["STUDENT"]);

    // Not verified yet: signing in sends a fresh code instead.
    const early = await signInWithPassword("ravi@example.com", "blue-river-42", nextIp());
    expect(early).toMatchObject({ ok: false, needsVerification: true });

    const code = await lastCode("ravi@example.com");
    expect(
      await verifyEmail("ravi@example.com", code === "000000" ? "111111" : "000000"),
    ).toMatchObject({ ok: false, field: "code" });
    expect(await verifyEmail("ravi@example.com", code)).toEqual({
      ok: true,
      userId: user.id,
      isNew: true,
    });
    expect(await verifyEmail("ravi@example.com", code)).toMatchObject({ ok: false }); // used up

    expect(await signInWithPassword("RAVI@example.com", "blue-river-42", nextIp())).toEqual({
      ok: true,
      userId: user.id,
      isNew: true,
    });
    expect(await signInWithPassword("ravi@example.com", "wrong-password", nextIp())).toEqual({
      ok: false,
      error: "Email or password is wrong.",
    });
    expect(await signInWithPassword("nobody@example.com", "blue-river-42", nextIp())).toEqual({
      ok: false,
      error: "Email or password is wrong.",
    });
  });

  it("rejects weak passwords and existing accounts", async () => {
    expect(
      await signUp({ name: "A B", email: "a@example.com", password: "password123" }, nextIp()),
    ).toMatchObject({ ok: false, field: "password" });
    await signUp({ name: "Ravi", email: "ravi@example.com", password: "blue-river-42" }, nextIp());
    await verifyEmail("ravi@example.com", await lastCode("ravi@example.com"));
    expect(
      await signUp(
        { name: "Ravi", email: "ravi@example.com", password: "blue-river-42" },
        nextIp(),
      ),
    ).toMatchObject({
      ok: false,
      field: "email",
    });
  });

  it("burns a code after five wrong tries and limits how often codes are sent", async () => {
    const address = nextIp();
    await signUp({ name: "Ravi", email: "ravi@example.com", password: "blue-river-42" }, address);
    const code = await lastCode("ravi@example.com");
    const wrong = code === "999999" ? "000000" : "999999";
    for (let i = 0; i < 5; i++) await verifyEmail("ravi@example.com", wrong);
    expect(await verifyEmail("ravi@example.com", code)).toMatchObject({
      ok: false,
      error: /expired/,
    });

    // 3 codes per 10 minutes per address: the sign-up sent one, two resends are allowed.
    expect(await resendVerification("ravi@example.com", address)).toEqual({ ok: true });
    expect(await resendVerification("ravi@example.com", address)).toEqual({ ok: true });
    expect(await resendVerification("ravi@example.com", address)).toMatchObject({
      ok: false,
      error: /Too many/,
    });
  });

  it("counts guesses sent at the same moment against the five tries", async () => {
    await signUp({ name: "Ravi", email: "ravi@example.com", password: "blue-river-42" }, nextIp());
    const code = await lastCode("ravi@example.com");
    const wrong = code === "999999" ? "000000" : "999999";
    await Promise.all(Array.from({ length: 20 }, () => verifyEmail("ravi@example.com", wrong)));
    const row = await db.verificationCode.findFirstOrThrow({
      where: { target: "ravi@example.com" },
      orderBy: { createdAt: "desc" },
    });
    expect(row.attempts).toBe(5);
    expect(await verifyEmail("ravi@example.com", code)).toMatchObject({ ok: false });
  });

  it("limits password guesses per account", async () => {
    await signUp({ name: "Ravi", email: "ravi@example.com", password: "blue-river-42" }, nextIp());
    await verifyEmail("ravi@example.com", await lastCode("ravi@example.com"));
    for (let i = 0; i < 10; i++)
      await signInWithPassword("ravi@example.com", `guess-${i}-xyz`, nextIp());
    expect(await signInWithPassword("ravi@example.com", "blue-river-42", nextIp())).toMatchObject({
      ok: false,
      error: /Too many/,
    });
  });
});

describe("phone OTP", () => {
  it("signs in an existing user or creates a new account", async () => {
    expect(await requestPhoneCode("12345", nextIp())).toMatchObject({ ok: false, field: "phone" });
    expect(await requestPhoneCode("98765 43210", nextIp())).toEqual({
      ok: true,
      phone: "+919876543210",
    });
    const sms = await db.notification.findFirstOrThrow({ where: { to: "+919876543210" } });
    expect(sms.channel).toBe("SMS");
    const fresh = await verifyPhoneCode("+91 98765 43210", await lastCode("+919876543210"));
    expect(fresh).toMatchObject({ ok: true, isNew: true });
    const user = await db.user.findUniqueOrThrow({ where: { phoneNumber: "+919876543210" } });
    expect(user).toMatchObject({ phoneNumberVerified: true, email: null, roles: ["STUDENT"] });

    await db.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
    await requestPhoneCode("9876543210", nextIp());
    expect(await verifyPhoneCode("9876543210", await lastCode("+919876543210"))).toEqual({
      ok: true,
      userId: user.id,
      isNew: false,
    });
    expect(await db.user.count()).toBe(1);
  });
});

describe("password reset", () => {
  it("never reveals whether an account exists, and signs out other devices", async () => {
    expect(await requestPasswordReset("ghost@example.com", nextIp())).toEqual({ ok: true });
    expect(await db.notification.count({ where: { to: "ghost@example.com" } })).toBe(0);

    await signUp({ name: "Ravi", email: "ravi@example.com", password: "blue-river-42" }, nextIp());
    const user = await db.user.findUniqueOrThrow({ where: { email: "ravi@example.com" } });
    await db.session.create({
      data: { userId: user.id, method: "password", expiresAt: new Date(Date.now() + 86_400_000) },
    });

    expect(await requestPasswordReset("ravi@example.com", nextIp())).toEqual({ ok: true });
    const code = await lastCode("ravi@example.com");
    expect(await resetPassword("ravi@example.com", code, "short")).toMatchObject({
      ok: false,
      field: "password",
    });
    expect(await resetPassword("ravi@example.com", code, "green-hill-77")).toMatchObject({
      ok: true,
      userId: user.id,
    });
    expect(await db.session.count({ where: { userId: user.id, revokedAt: null } })).toBe(0);
    // The emailed code also proves the address.
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerified).toBe(true);
    expect(await signInWithPassword("ravi@example.com", "green-hill-77", nextIp())).toMatchObject({
      ok: true,
    });
    expect(await signInWithPassword("ravi@example.com", "blue-river-42", nextIp())).toMatchObject({
      ok: false,
    });
  });

  it("changes the password with the current one, keeping this device signed in", async () => {
    await signUp({ name: "Ravi", email: "ravi@example.com", password: "blue-river-42" }, nextIp());
    const user = await db.user.findUniqueOrThrow({ where: { email: "ravi@example.com" } });
    const here = await db.session.create({
      data: { userId: user.id, method: "password", expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const other = await db.session.create({
      data: { userId: user.id, method: "password", expiresAt: new Date(Date.now() + 86_400_000) },
    });
    expect(await changePassword(user.id, "wrong", "green-hill-77", here.id)).toMatchObject({
      ok: false,
      field: "current",
    });
    expect(await changePassword(user.id, "blue-river-42", "green-hill-77", here.id)).toEqual({
      ok: true,
    });
    expect((await db.session.findUniqueOrThrow({ where: { id: here.id } })).revokedAt).toBeNull();
    expect(
      (await db.session.findUniqueOrThrow({ where: { id: other.id } })).revokedAt,
    ).not.toBeNull();
  });
});
