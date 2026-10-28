"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { homePathFor, isAdmin, safeRedirectPath } from "@/lib/permissions";
import { endSession, LOGIN_PATH, requestIp, startSession, type SignInMethod } from "@/server/auth";
import { db } from "@/server/db";
import { env } from "@/server/env";
import {
  requestPasswordReset,
  requestPhoneCode,
  resendVerification,
  resetPassword,
  signInWithPassword,
  signUp,
  verifyEmail,
  verifyPhoneCode,
} from "@/server/services/accounts";

export type AuthState = {
  error?: string;
  field?: string;
  sent?: boolean;
  phone?: string;
  info?: string;
};

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "").slice(0, 300);

/** Starts the session and sends the user on: new students to onboarding, others home. */
async function finishSignIn(
  userId: string,
  method: SignInMethod,
  next: string | null,
): Promise<never> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { roles: true, onboardedAt: true },
  });
  await startSession(userId, method);
  // Students who haven't set up their profile go straight to onboarding (no dashboard flash).
  const needsOnboarding =
    !user.onboardedAt && !isAdmin(user.roles) && !user.roles.includes("INTERVIEWER");
  redirect(needsOnboarding ? "/onboarding" : (safeRedirectPath(next) ?? homePathFor(user.roles)));
}

export async function signInWithPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = text(formData, "email");
  const result = await signInWithPassword(email, text(formData, "password"), await requestIp());
  if (result.ok) return finishSignIn(result.userId, "password", text(formData, "next") || null);
  if ("needsVerification" in result) {
    redirect(`/verify-email?email=${encodeURIComponent(result.email)}&sent=1`);
  }
  return { error: result.error, field: result.field };
}

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const result = await signUp(
    {
      name: text(formData, "name"),
      email: text(formData, "email"),
      password: text(formData, "password"),
    },
    await requestIp(),
  );
  if (!result.ok) return { error: result.error, field: result.field };
  // TEST_MODE: no code to confirm, sign straight in.
  if (result.userId) return finishSignIn(result.userId, "password", null);
  redirect(`/verify-email?email=${encodeURIComponent(result.email)}&sent=1`);
}

export async function verifyEmailAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const result = await verifyEmail(text(formData, "email"), text(formData, "code"));
  if (!result.ok) return { error: result.error, field: result.field };
  return finishSignIn(result.userId, "email-otp", text(formData, "next") || null);
}

export async function resendVerificationAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const result = await resendVerification(text(formData, "email"), await requestIp());
  return result.ok ? { info: "We've sent a new code." } : { error: result.error };
}

export async function requestPhoneCodeAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const result = await requestPhoneCode(text(formData, "phone"), await requestIp());
  if (!result.ok) return { error: result.error, field: result.field };
  return { sent: true, phone: result.phone };
}

export async function verifyPhoneCodeAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const phone = text(formData, "phone");
  const result = await verifyPhoneCode(phone, text(formData, "code"));
  if (!result.ok) return { error: result.error, field: result.field, sent: true, phone };
  return finishSignIn(result.userId, "phone-otp", text(formData, "next") || null);
}

export async function forgotPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = text(formData, "email");
  const result = await requestPasswordReset(email, await requestIp());
  if (!result.ok) return { error: result.error, field: result.field };
  redirect(`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`);
}

export async function resetPasswordAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const result = await resetPassword(
    text(formData, "email"),
    text(formData, "code"),
    text(formData, "password"),
  );
  if (!result.ok) return { error: result.error, field: result.field };
  return finishSignIn(result.userId, "email-otp", null);
}

const devSignInSchema = z.object({
  userId: z.string().min(1),
  next: z.string().optional(),
});

/** Dev login: sign in as a seeded user (D-020). Only with AUTH_MODE=dev. */
export async function signInAsDevUser(formData: FormData) {
  if (env().AUTH_MODE !== "dev") redirect(LOGIN_PATH);
  const parsed = devSignInSchema.safeParse({
    userId: formData.get("userId"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) redirect(LOGIN_PATH);
  const user = await db.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true },
  });
  if (!user) redirect(LOGIN_PATH);
  return finishSignIn(user.id, "dev", parsed.data.next ?? null);
}

export async function signOut() {
  await endSession();
  redirect("/");
}
