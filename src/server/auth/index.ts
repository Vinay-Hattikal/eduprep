// The only entry point for authentication. Pages, server actions and route handlers call
// these helpers; Phase 6 swaps the internals for Better Auth without changing callers (D-020).
//
// With Cache Components, anything that awaits these must render inside <Suspense>.

import "server-only";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { ProfileType, Role } from "@/generated/prisma/enums";
import { can, type Permission } from "@/lib/permissions";
import { db } from "@/server/db";
import { env } from "@/server/env";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  verifySessionToken,
} from "@/server/auth/session-token";

/** The narrow user shape exposed to the app. Never return the raw DB row. */
export type CurrentUser = {
  id: string;
  name: string;
  email: string | null;
  roles: Role[];
  profileType: ProfileType | null;
  onboarded: boolean;
};

export const LOGIN_PATH = "/sign-in";
export const ACCESS_DENIED_PATH = "/access-denied";

/** The signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const payload = await verifySessionToken(token, env().AUTH_SECRET);
  if (!payload) return null;

  // The session must still exist, belong to this user, and be neither revoked nor expired.
  const session = await db.session.findUnique({
    where: { id: payload.sessionId },
    select: {
      userId: true,
      revokedAt: true,
      expiresAt: true,
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          roles: true,
          profileType: true,
          onboardedAt: true,
        },
      },
    },
  });
  if (
    !session ||
    session.userId !== payload.userId ||
    session.revokedAt ||
    session.expiresAt <= new Date()
  ) {
    return null;
  }
  const { user } = session;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: user.roles,
    profileType: user.profileType,
    onboarded: user.onboardedAt !== null,
  };
});

/** The current session's id (for "sign out other devices"), or null. */
export async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return (await verifySessionToken(token, env().AUTH_SECRET))?.sessionId ?? null;
}

/** The signed-in user; redirects to sign-in when there is none. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(LOGIN_PATH);
  return user;
}

/** The signed-in user with the given permission; otherwise redirects. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const user = await requireUser();
  if (!can(user.roles, permission)) redirect(ACCESS_DENIED_PATH);
  return user;
}

export type SignInMethod = "password" | "phone-otp" | "email-otp" | "dev";

/** Starts a session for a user. Call only from a server action after verifying the user. */
export async function startSession(userId: string, method: SignInMethod): Promise<void> {
  const config = env();
  const requestHeaders = await headers();
  const session = await db.session.create({
    data: {
      userId,
      method,
      expiresAt: new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000),
      userAgent: requestHeaders.get("user-agent")?.slice(0, 300) ?? null,
      ip: clientIp(requestHeaders),
    },
    select: { id: true },
  });
  const token = await signSessionToken({ userId, sessionId: session.id }, config.AUTH_SECRET);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.APP_ENV === "staging" || config.APP_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Ends this device's session (the row is revoked, not just the cookie dropped). */
export async function endSession(): Promise<void> {
  const sessionId = await currentSessionId();
  if (sessionId) {
    await db.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  (await cookies()).delete(SESSION_COOKIE);
}

/** The caller's IP as seen by the first proxy (for rate limits and the sessions list). */
export function clientIp(requestHeaders: Headers): string | null {
  const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || requestHeaders.get("x-real-ip") || null)?.slice(0, 64) ?? null;
}

export async function requestIp(): Promise<string> {
  return clientIp(await headers()) ?? "unknown";
}
