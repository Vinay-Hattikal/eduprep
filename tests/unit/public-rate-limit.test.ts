import { describe, expect, it } from "vitest";
import {
  clientKey,
  isKnownCrawler,
  isPublicContentPath,
  PUBLIC_LIMITS,
  PublicRateLimiter,
  visitKind,
} from "@/lib/public-rate-limit";

describe("public page rate limit (D-058, C.5)", () => {
  it("applies to question, problem and mock-test pages only", () => {
    for (const path of [
      "/questions",
      "/questions/quant/percentages",
      "/question/qa-1",
      "/problems/x",
      "/mock-tests",
    ])
      expect(isPublicContentPath(path), path).toBe(true);
    for (const path of ["/", "/companies/acme", "/practice", "/questionsx", "/admin/questions"])
      expect(isPublicContentPath(path), path).toBe(false);
  });

  it("lets a visitor read up to the limit per minute, then asks them to wait", () => {
    const limiter = new PublicRateLimiter();
    const t0 = 1_000_000;
    for (let i = 0; i < PUBLIC_LIMITS.visitor; i++)
      expect(limiter.hit("1.2.3.4", "visitor", t0 + i)).toEqual({ ok: true });
    expect(limiter.hit("1.2.3.4", "visitor", t0 + 30_000)).toEqual({ ok: false, retryAfter: 30 });
    // Someone else isn't affected, and the next window starts fresh.
    expect(limiter.hit("5.6.7.8", "visitor", t0 + 30_000)).toEqual({ ok: true });
    expect(limiter.hit("1.2.3.4", "visitor", t0 + PUBLIC_LIMITS.windowMs)).toEqual({ ok: true });
  });

  it("gives self-declared crawlers more room", () => {
    const limiter = new PublicRateLimiter();
    for (let i = 0; i < PUBLIC_LIMITS.crawler; i++)
      expect(limiter.hit("bot", "crawler", 0).ok).toBe(true);
    expect(limiter.hit("bot", "crawler", 0).ok).toBe(false);
    expect(isKnownCrawler("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isKnownCrawler("Mozilla/5.0 (Windows NT 10.0)")).toBe(false);
  });

  it("counts link preloads separately, so they can't lock a reader out", () => {
    expect(visitKind(new Headers({ "next-router-prefetch": "1" }))).toBe("prefetch");
    expect(visitKind(new Headers({ "sec-purpose": "prefetch" }))).toBe("prefetch");
    expect(visitKind(new Headers({ "user-agent": "Googlebot/2.1" }))).toBe("crawler");
    expect(visitKind(new Headers())).toBe("visitor");
    const limiter = new PublicRateLimiter();
    for (let i = 0; i < PUBLIC_LIMITS.prefetch; i++) limiter.hit("1.1.1.1", "prefetch", 0);
    expect(limiter.hit("1.1.1.1", "visitor", 0).ok).toBe(true);
  });

  it("keeps memory bounded", () => {
    const limiter = new PublicRateLimiter(10);
    for (let i = 0; i < 100; i++) limiter.hit(`10.0.0.${i}`, "visitor", i);
    expect(limiter.hit("10.0.0.200", "visitor", 200)).toEqual({ ok: true });
  });

  it("counts the address our own proxies saw, not what the sender wrote", () => {
    const xff = (value: string) => new Headers({ "x-forwarded-for": value });
    // A scraper writes a fake address on the left; the host appends the real one.
    expect(clientKey(xff("1.2.3.4, 203.0.113.9"))).toBe("203.0.113.9");
    // Addresses on our own network are skipped from the right.
    expect(clientKey(xff("203.0.113.9, 10.0.0.2"))).toBe("203.0.113.9");
    // A CDN in front of the host: skip one more public hop.
    expect(clientKey(xff("1.2.3.4, 203.0.113.9, 198.51.100.1"), { trustedHops: 2 })).toBe(
      "203.0.113.9",
    );
    expect(clientKey(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientKey(new Headers())).toBeNull();
  });

  it("skips this machine only outside production", () => {
    for (const local of ["127.0.0.1", "::1", "::ffff:127.0.0.1"]) {
      const headers = new Headers({ "x-forwarded-for": local });
      expect(clientKey(headers, { exemptLocal: true })).toBeNull();
      expect(clientKey(headers)).toBe(local);
    }
  });
});
