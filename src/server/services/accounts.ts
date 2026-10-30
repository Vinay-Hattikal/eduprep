import "server-only";

import type { CodePurpose } from "@/generated/prisma/enums";
import {
  isValidCode,
  isValidEmail,
  normalizeEmail,
  normalizeIndianPhone,
  passwordProblem,
} from "@/lib/auth/credentials";
import {
  codeMatches,
  DUMMY_HASH,
  generateCode,
  hashCode,
  hashPassword,
  verifyPassword,
} from "@/server/auth/secrets";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { recordAudit } from "@/server/services/audit";
import { sendCodeNow } from "@/server/services/notifications";
import { hitAll, waitMessage, type Limit } from "@/server/services/rate-limit";

// Accounts (D-043): email + password with a verified address, phone OTP sign-in, password
// reset. These functions decide; server actions start the session (cookies live there).

export const CODE_MINUTES = 10;
export const MAX_CODE_ATTEMPTS = 5;

type Fail = { ok: false; error: string; field?: string };
type SignedIn = { ok: true; userId: string; isNew: boolean };

const MINUTE = 60;
const HOUR = 3600;

function limits(...items: [string, number, number][]): Limit[] {
  return items.map(([key, limit, windowSeconds]) => ({ key, limit, windowSeconds }));
}

// ---------- codes ----------

async function issueCode(purpose: CodePurpose, target: string, userId: string | null, now: Date) {
  const code = generateCode();
  // A new code replaces older unused ones for the same purpose and target.
  await db.verificationCode.updateMany({
    where: { purpose, target, consumedAt: null },
    data: { consumedAt: now },
  });
  await db.verificationCode.create({
    data: {
      purpose,
      target,
      userId,
      codeHash: hashCode(code, env().AUTH_SECRET),
      expiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000),
    },
  });
  return code;
}

/** Checks a code; a correct one is used up, wrong guesses count towards burning it. */
async function consumeCode(
  purpose: CodePurpose,
  target: string,
  code: string,
  now: Date,
): Promise<{ ok: true; userId: string | null } | Fail> {
  if (!isValidCode(code)) return { ok: false, error: "Enter the 6-digit code.", field: "code" };
  const row = await db.verificationCode.findFirst({
    where: { purpose, target, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const expired = {
    ok: false as const,
    error: "This code has expired. Ask for a new one.",
    field: "code" as const,
  };
  if (!row || row.expiresAt <= now) return expired;
  // Every check uses up a try first, in one statement, so guesses sent in parallel can't get
  // past the limit by all reading the count before any of them adds to it.
  const claimed = await db.verificationCode.updateMany({
    where: { id: row.id, consumedAt: null, attempts: { lt: MAX_CODE_ATTEMPTS } },
    data: { attempts: { increment: 1 } },
  });
  if (!claimed.count) return expired;
  if (!codeMatches(code, row.codeHash, env().AUTH_SECRET)) {
    const { attempts } = await db.verificationCode.findUniqueOrThrow({
      where: { id: row.id },
      select: { attempts: true },
    });
    const left = MAX_CODE_ATTEMPTS - attempts;
    return {
      ok: false,
      error:
        left > 0
          ? `That code isn't right. ${left} tries left.`
          : "Too many wrong tries. Ask for a new code.",
      field: "code",
    };
  }
  const used = await db.verificationCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: now },
  });
  if (!used.count) return { ok: false, error: "This code was already used.", field: "code" };
  return { ok: true, userId: row.userId };
}

async function sendLimits(target: string, ip: string, now: Date) {
  return hitAll(
    limits(
      [`code:${target}`, 3, 10 * MINUTE],
      [`code-day:${target}`, 10, 24 * HOUR],
      [`code-ip:${ip}`, 20, HOUR],
    ),
    now,
  );
}

// ---------- email sign-up ----------

export type SignUpInput = { name: string; email: string; password: string };

export async function signUp(
  input: SignUpInput,
  ip: string,
  now = new Date(),
): Promise<{ ok: true; email: string; userId?: string } | Fail> {
  const name = input.name.trim();
  const email = normalizeEmail(input.email);
  if (name.length < 2 || name.length > 80)
    return { ok: false, error: "Enter your name.", field: "name" };
  if (!isValidEmail(email))
    return { ok: false, error: "Enter a valid email address.", field: "email" };
  const weak = passwordProblem(input.password, { email, name });
  if (weak) return { ok: false, error: weak, field: "password" };
  const limited = await hitAll(limits([`signup-ip:${ip}`, 10, HOUR]), now);
  if (!limited.ok) return { ok: false, error: waitMessage(limited.retryAfterSeconds) };

  const existing = await db.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true, password: { select: { userId: true } } },
  });
  if (existing?.emailVerified || (existing && existing.password)) {
    return {
      ok: false,
      error: "An account with this email already exists. Sign in, or reset your password.",
      field: "email",
    };
  }
  const passwordHash = await hashPassword(input.password);
  // TEST_MODE: the email counts as confirmed straight away, so no code is needed.
  const emailVerified = env().TEST_MODE || undefined;
  const user = existing
    ? await db.user.update({
        where: { id: existing.id },
        data: { name, emailVerified, password: { create: { passwordHash } } },
      })
    : await db.user.create({
        data: {
          name,
          email,
          emailVerified,
          roles: ["STUDENT"],
          password: { create: { passwordHash } },
        },
      });
  if (env().TEST_MODE) return { ok: true, email, userId: user.id };
  const sent = await sendEmailCode(user.id, email, "EMAIL_VERIFY", ip, now);
  if (!sent.ok) return sent;
  return { ok: true, email };
}

async function sendEmailCode(
  userId: string,
  email: string,
  purpose: "EMAIL_VERIFY" | "PASSWORD_RESET",
  ip: string,
  now: Date,
): Promise<{ ok: true } | Fail> {
  const limited = await sendLimits(email, ip, now);
  if (!limited.ok) return { ok: false, error: waitMessage(limited.retryAfterSeconds) };
  const code = await issueCode(purpose, email, userId, now);
  await sendCodeNow({
    userId,
    channel: "EMAIL",
    to: email,
    code,
    purpose: purpose === "EMAIL_VERIFY" ? "verify" : "reset",
    minutes: CODE_MINUTES,
  });
  return { ok: true };
}

/** Sends a fresh verification code to an unverified address. Silent for anything else. */
export async function resendVerification(
  emailInput: string,
  ip: string,
  now = new Date(),
): Promise<{ ok: true } | Fail> {
  const email = normalizeEmail(emailInput);
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, emailVerified: true },
  });
  if (!user || user.emailVerified) return { ok: true };
  return sendEmailCode(user.id, email, "EMAIL_VERIFY", ip, now);
}

export async function verifyEmail(
  emailInput: string,
  code: string,
  now = new Date(),
): Promise<SignedIn | Fail> {
  const email = normalizeEmail(emailInput);
  const result = await consumeCode("EMAIL_VERIFY", email, code.trim(), now);
  if (!result.ok) return result;
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, onboardedAt: true },
  });
  if (!user || user.id !== result.userId)
    return { ok: false, error: "This code has expired. Ask for a new one.", field: "code" };
  await db.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  return { ok: true, userId: user.id, isNew: !user.onboardedAt };
}

// ---------- password sign-in ----------

export type PasswordSignIn =
  SignedIn | Fail | { ok: false; needsVerification: true; email: string; error: string };

export async function signInWithPassword(
  emailInput: string,
  password: string,
  ip: string,
  now = new Date(),
): Promise<PasswordSignIn> {
  const email = normalizeEmail(emailInput);
  const limited = await hitAll(
    limits([`login:${email}`, 10, 15 * MINUTE], [`login-ip:${ip}`, 50, 15 * MINUTE]),
    now,
  );
  if (!limited.ok) return { ok: false, error: waitMessage(limited.retryAfterSeconds) };

  const user = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      emailVerified: true,
      onboardedAt: true,
      password: { select: { passwordHash: true } },
    },
  });
  // Same work whether or not the account exists, so timing doesn't reveal accounts.
  const valid = await verifyPassword(password, user?.password?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.password || !valid) return { ok: false, error: "Email or password is wrong." };
  if (!user.emailVerified && env().TEST_MODE) {
    await db.user.update({ where: { id: user.id }, data: { emailVerified: true } });
  } else if (!user.emailVerified) {
    const sent = await sendEmailCode(user.id, email, "EMAIL_VERIFY", ip, now);
    return sent.ok
      ? {
          ok: false,
          needsVerification: true,
          email,
          error: "Confirm your email first: we've sent you a code.",
        }
      : sent;
  }
  return { ok: true, userId: user.id, isNew: !user.onboardedAt };
}

// ---------- phone OTP ----------

export async function requestPhoneCode(
  phoneInput: string,
  ip: string,
  now = new Date(),
): Promise<{ ok: true; phone: string } | Fail> {
  const phone = normalizeIndianPhone(phoneInput);
  if (!phone) return { ok: false, error: "Enter a 10-digit Indian mobile number.", field: "phone" };
  const limited = await sendLimits(phone, ip, now);
  if (!limited.ok) return { ok: false, error: waitMessage(limited.retryAfterSeconds) };
  const user = await db.user.findUnique({ where: { phoneNumber: phone }, select: { id: true } });
  const code = await issueCode("PHONE_LOGIN", phone, user?.id ?? null, now);
  await sendCodeNow({
    userId: user?.id ?? null,
    channel: "SMS",
    to: phone,
    code,
    purpose: "login",
    minutes: CODE_MINUTES,
  });
  return { ok: true, phone };
}

/** Signs in with a phone code; a new number creates an account (name is asked in onboarding). */
export async function verifyPhoneCode(
  phoneInput: string,
  code: string,
  now = new Date(),
): Promise<SignedIn | Fail> {
  const phone = normalizeIndianPhone(phoneInput);
  if (!phone) return { ok: false, error: "Enter a 10-digit Indian mobile number.", field: "phone" };
  const result = await consumeCode("PHONE_LOGIN", phone, code.trim(), now);
  if (!result.ok) return result;
  const existing = await db.user.findUnique({
    where: { phoneNumber: phone },
    select: { id: true, onboardedAt: true },
  });
  if (existing) {
    await db.user.update({ where: { id: existing.id }, data: { phoneNumberVerified: true } });
    return { ok: true, userId: existing.id, isNew: !existing.onboardedAt };
  }
  const user = await db.user.create({
    data: {
      name: "New student",
      phoneNumber: phone,
      phoneNumberVerified: true,
      roles: ["STUDENT"],
    },
    select: { id: true },
  });
  return { ok: true, userId: user.id, isNew: true };
}

// ---------- password reset and change ----------

/** Always answers the same way, so it can't be used to find out who has an account. */
export async function requestPasswordReset(
  emailInput: string,
  ip: string,
  now = new Date(),
): Promise<{ ok: true } | Fail> {
  const email = normalizeEmail(emailInput);
  if (!isValidEmail(email))
    return { ok: false, error: "Enter a valid email address.", field: "email" };
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    await sendLimits(email, ip, now); // count anyway
    return { ok: true };
  }
  const sent = await sendEmailCode(user.id, email, "PASSWORD_RESET", ip, now);
  return sent.ok ? { ok: true } : sent;
}

export async function resetPassword(
  emailInput: string,
  code: string,
  password: string,
  now = new Date(),
): Promise<SignedIn | Fail> {
  const email = normalizeEmail(emailInput);
  const weak = passwordProblem(password, { email });
  if (weak) return { ok: false, error: weak, field: "password" };
  const result = await consumeCode("PASSWORD_RESET", email, code.trim(), now);
  if (!result.ok) return result;
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, onboardedAt: true },
  });
  if (!user || user.id !== result.userId)
    return { ok: false, error: "This code has expired. Ask for a new one.", field: "code" };
  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.passwordCredential.upsert({
      where: { userId: user.id },
      create: { userId: user.id, passwordHash },
      update: { passwordHash },
    }),
    // Receiving the code proves the inbox, so the address counts as verified.
    db.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
    // Anyone signed in with the old password is signed out everywhere.
    db.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: now },
    }),
  ]);
  await recordAudit({
    actorId: user.id,
    action: "account.password_reset",
    entityType: "user",
    entityId: user.id,
  });
  return { ok: true, userId: user.id, isNew: !user.onboardedAt };
}

export async function changePassword(
  userId: string,
  current: string,
  next: string,
  keepSessionId: string | null,
  now = new Date(),
): Promise<{ ok: true } | Fail> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, password: { select: { passwordHash: true } } },
  });
  if (!user) return { ok: false, error: "Account not found." };
  if (user.password && !(await verifyPassword(current, user.password.passwordHash))) {
    return { ok: false, error: "Your current password is wrong.", field: "current" };
  }
  const weak = passwordProblem(next, { email: user.email ?? undefined });
  if (weak) return { ok: false, error: weak, field: "password" };
  const passwordHash = await hashPassword(next);
  await db.$transaction([
    db.passwordCredential.upsert({
      where: { userId },
      create: { userId, passwordHash },
      update: { passwordHash },
    }),
    db.session.updateMany({
      where: { userId, revokedAt: null, id: { not: keepSessionId ?? "" } },
      data: { revokedAt: now },
    }),
  ]);
  await recordAudit({
    actorId: userId,
    action: "account.password_change",
    entityType: "user",
    entityId: userId,
  });
  return { ok: true };
}

export async function listSessions(userId: string) {
  return db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, userAgent: true, ip: true, method: true },
  });
}

export async function revokeOtherSessions(
  userId: string,
  keepSessionId: string | null,
  now = new Date(),
) {
  const result = await db.session.updateMany({
    where: { userId, revokedAt: null, id: { not: keepSessionId ?? "" } },
    data: { revokedAt: now },
  });
  return result.count;
}

export async function accountSecurity(userId: string) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      email: true,
      emailVerified: true,
      phoneNumber: true,
      phoneNumberVerified: true,
      password: { select: { updatedAt: true } },
    },
  });
  return {
    ...user,
    hasPassword: Boolean(user.password),
    passwordUpdatedAt: user.password?.updatedAt ?? null,
  };
}
