// Two jobs, both before rendering:
// 1. Public question, problem and mock-test pages: limit how fast one visitor loads them, so the
//    bank can't be scraped in bulk (D-058, C.5).
// 2. Protected areas: an optimistic sign-in check that sends signed-out visitors to sign-in.
//    This is NOT the authorization check. Every page, action and route re-checks on the server
//    through src/server/auth (rules.md, Security).

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth/session-token";
import { env } from "@/server/env";
import {
  clientKey,
  isKnownCrawler,
  isPublicContentPath,
  PublicRateLimiter,
} from "@/lib/public-rate-limit";

// One per server process (the proxy runs in Node.js and stays loaded between requests).
const publicLimiter = new PublicRateLimiter();

export async function proxy(request: NextRequest) {
  if (isPublicContentPath(request.nextUrl.pathname)) {
    const key = clientKey(request.headers, { exemptLocal: env().APP_ENV !== "production" });
    if (!key) return NextResponse.next();
    const verdict = publicLimiter.hit(
      key,
      isKnownCrawler(request.headers.get("user-agent")),
      Date.now(),
    );
    if (verdict.ok) return NextResponse.next();
    return new NextResponse("Too many pages too quickly. Please wait a minute and try again.", {
      status: 429,
      headers: { "Retry-After": String(verdict.retryAfter), "Content-Type": "text/plain" },
    });
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySessionToken(token, env().AUTH_SECRET);
  if (session) return NextResponse.next();

  const loginUrl = new URL("/sign-in", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Public content pages (rate limit only).
    "/question/:path*",
    "/questions/:path*",
    "/problems/:path*",
    "/mock-tests/:path*",
    // Protected areas (sign-in check).
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
