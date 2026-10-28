// Optimistic sign-in check: send signed-out visitors to sign-in before rendering protected areas.
// This is NOT the authorization check. Every page, action and route re-checks on the server
// through src/server/auth (rules.md, Security).

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth/session-token";
import { env } from "@/server/env";

export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token, env().AUTH_SECRET);
  if (session) return NextResponse.next();

  const loginUrl = new URL("/sign-in", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/practice/:path*",
    "/tests/:path*",
    "/coding/:path*",
    "/interviews/:path*",
    "/progress/:path*",
    "/admin/:path*",
    "/interviewer/:path*",
    "/onboarding/:path*",
    "/exam/:path*",
    "/account/:path*",
    "/checkout/:path*",
    "/tracks/:path*",
    "/design/:path*",
    "/experiences/:path*",
    "/meet/:path*",
    "/contests/:path*",
    "/achievements/:path*",
    "/asked/:path*",
  ],
};
