import { describe, expect, it } from "vitest";
import {
  clientKey,
  isKnownCrawler,
  isPublicContentPath,
  PUBLIC_LIMITS,
  PublicRateLimiter,
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
      expect(limiter.hit("1.2.3.4", false, t0 + i)).toEqual({ ok: true });
    expect(limiter.hit("1.2.3.4", false, t0 + 30_000)).toEqual({ ok: false, retryAfter: 30 });
    // Someone else isn't affected, and the next window starts fresh.
    expect(limiter.hit("5.6.7.8", false, t0 + 30_000)).toEqual({ ok: true });
    expect(limiter.hit("1.2.3.4", false, t0 + PUBLIC_LIMITS.windowMs)).toEqual({ ok: true });
  });

  it("gives self-declared crawlers more room", () => {
    const limiter = new PublicRateLimiter();
    for (let i = 0; i < PUBLIC_LIMITS.crawler; i++)
      expect(limiter.hit("bot", true, 0).ok).toBe(true);
    expect(limiter.hit("bot", true, 0).ok).toBe(false);
    expect(isKnownCrawler("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isKnownCrawler("Mozilla/5.0 (Windows NT 10.0)")).toBe(false);
  });

  it("keeps memory bounded", () => {
    const limiter = new PublicRateLimiter(10);
    for (let i = 0; i < 100; i++) limiter.hit(`10.0.0.${i}`, false, i);
    expect(limiter.hit("10.0.0.200", false, 200)).toEqual({ ok: true });
  });

  it("reads the forwarded address, and nothing when there's none", () => {
    expect(clientKey(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
    expect(clientKey(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(clientKey(new Headers())).toBeNull();
    for (const local of ["127.0.0.1", "::1", "::ffff:127.0.0.1"])
      expect(clientKey(new Headers({ "x-forwarded-for": local }))).toBeNull();
  });
});
