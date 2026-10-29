// The visitor's address as the first proxy reports it. Pure (no server-only imports), so the
// proxy's rate limit and the auth module share it.

export function forwardedIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || headers.get("x-real-ip")?.trim() || null)?.slice(0, 64) ?? null;
}
