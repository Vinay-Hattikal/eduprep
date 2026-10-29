// Limits how fast one visitor can load the public question, problem and mock-test pages, so the
// bank can't be copied in bulk (D-058, C.5). Runs in the proxy, in memory: it resets on restart
// and isn't shared between server instances, which is fine for slowing scrapers. Phase 6 can
// move it to Redis or the CDN. Pure (clock passed in), so it's unit-tested.

export const PUBLIC_LIMITS = {
  /** Pages per window for ordinary visitors. A person reading answers stays far below this. */
  visitor: 60,
  /** Self-declared search crawlers (the user agent can be faked, so this stays bounded). */
  crawler: 300,
  windowMs: 60_000,
} as const;

/** Paths the limit applies to. */
export function isPublicContentPath(path: string): boolean {
  return /^\/(question|questions|problems|mock-tests)(\/|$)/.test(path);
}

const CRAWLERS = /googlebot|bingbot|duckduckbot|yandex|baiduspider|applebot|slurp/i;

export function isKnownCrawler(userAgent: string | null): boolean {
  return Boolean(userAgent && CRAWLERS.test(userAgent));
}

/**
 * The visitor's address as the hosting proxy reports it, or null when it reports none. With no
 * address there's nothing to limit by, and limiting everyone together would block real visitors.
 */
export function clientKey(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || headers.get("x-real-ip")?.trim() || null;
  // This machine itself (local development and tests). Behind hosting, the first forwarded
  // address is the visitor's, never loopback.
  if (key && /^(127\.|::1$|::ffff:127\.)/.test(key)) return null;
  return key;
}

type Window = { start: number; count: number };

/** Fixed one-minute windows per visitor. */
export class PublicRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly maxKeys = 50_000) {}

  /** Counts one page view. `retryAfter` (seconds) is set when the visitor is over the limit. */
  hit(
    key: string,
    crawler: boolean,
    now: number,
  ): { ok: true } | { ok: false; retryAfter: number } {
    const limit = crawler ? PUBLIC_LIMITS.crawler : PUBLIC_LIMITS.visitor;
    const id = `${crawler ? "bot" : "web"}:${key}`;
    let window = this.windows.get(id);
    if (!window || now - window.start >= PUBLIC_LIMITS.windowMs) {
      if (this.windows.size >= this.maxKeys) this.prune(now);
      window = { start: now, count: 0 };
      this.windows.set(id, window);
    }
    window.count += 1;
    if (window.count <= limit) return { ok: true };
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((window.start + PUBLIC_LIMITS.windowMs - now) / 1000)),
    };
  }

  /** Drops finished windows so memory stays bounded. */
  private prune(now: number) {
    for (const [id, w] of this.windows)
      if (now - w.start >= PUBLIC_LIMITS.windowMs) this.windows.delete(id);
    // Still full (a flood of new addresses): start over rather than grow without bound.
    if (this.windows.size >= this.maxKeys) this.windows.clear();
  }
}
