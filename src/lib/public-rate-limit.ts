// Limits how fast one visitor can load the public question, problem and mock-test pages, so the
// bank can't be copied in bulk (D-058, C.5). Runs in the proxy, in memory: it resets on restart
// and isn't shared between server instances, which is fine for slowing scrapers. Phase 6 can
// move it to Redis or the CDN. Pure (clock passed in), so it's unit-tested.

export const PUBLIC_LIMITS = {
  /** Pages per window for ordinary visitors. A person reading answers stays far below this. */
  visitor: 60,
  /** Self-declared search crawlers (the user agent can be faked, so this stays bounded). */
  crawler: 300,
  /**
   * Link preloads the browser makes on its own (a page full of links fires many at once). They
   * get their own, larger allowance so they never use up a reader's page budget.
   */
  prefetch: 300,
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

export type VisitKind = keyof Omit<typeof PUBLIC_LIMITS, "windowMs">;

/** Which allowance a request counts against. */
export function visitKind(headers: Headers): VisitKind {
  if (isKnownCrawler(headers.get("user-agent"))) return "crawler";
  const prefetch =
    headers.get("next-router-prefetch") === "1" ||
    /prefetch/i.test(headers.get("sec-purpose") ?? headers.get("purpose") ?? "");
  return prefetch ? "prefetch" : "visitor";
}

const LOCAL = /^(127\.|::1$|::ffff:127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd)/i;

/**
 * The address to count a visit against. Proxies append the address they received the request
 * from, so the right end of X-Forwarded-For is set by our own infrastructure and the left end by
 * whoever sent the request (a scraper can put anything there). We skip addresses on our own
 * network from the right, then `trustedHops - 1` more public proxies (e.g. a CDN in front of the
 * host), and use the next one. Null when there's nothing to count (local development and tests,
 * or no header at all; deployment.md §10 requires the host to send one).
 */
export function clientKey(
  headers: Headers,
  { trustedHops = 1, exemptLocal = false } = {},
): string | null {
  const chain = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const realIp = headers.get("x-real-ip")?.trim();
  if (!chain.length && realIp) chain.push(realIp);
  let i = chain.length - 1;
  while (i >= 0 && LOCAL.test(chain[i]!)) i -= 1;
  i -= Math.max(0, trustedHops - 1);
  const key = i >= 0 ? chain[i]! : null;
  if (!key) return exemptLocal || !chain.length ? null : chain[0]!;
  return key.slice(0, 64);
}

type Window = { start: number; count: number };

/** Fixed one-minute windows per visitor. */
export class PublicRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(private readonly maxKeys = 50_000) {}

  /** Counts one page view. `retryAfter` (seconds) is set when the visitor is over the limit. */
  hit(key: string, kind: VisitKind, now: number): { ok: true } | { ok: false; retryAfter: number } {
    const limit = PUBLIC_LIMITS[kind];
    const id = `${kind}:${key}`;
    let window = this.windows.get(id);
    if (!window || now - window.start >= PUBLIC_LIMITS.windowMs) {
      // Re-inserting keeps the map in start-time order, so pruning can stop early.
      this.windows.delete(id);
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

  /** Drops finished windows (oldest first) so memory stays bounded. */
  private prune(now: number) {
    for (const [id, w] of this.windows) {
      if (now - w.start < PUBLIC_LIMITS.windowMs) break;
      this.windows.delete(id);
    }
    // Still full (a flood of new addresses): start over rather than grow without bound.
    if (this.windows.size >= this.maxKeys) this.windows.clear();
  }
}
