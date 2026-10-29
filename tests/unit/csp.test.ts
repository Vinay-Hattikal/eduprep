import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@/config/csp";

function directives(policy: string) {
  return new Map(
    policy.split("; ").map((part) => {
      const [name, ...values] = part.split(" ");
      return [name!, values];
    }),
  );
}

describe("contentSecurityPolicy", () => {
  const prod = directives(contentSecurityPolicy({ dev: false, https: true }));
  const dev = directives(contentSecurityPolicy({ dev: true, https: false }));

  it("allows scripts only from this site and Razorpay Checkout, never eval in production", () => {
    expect(prod.get("script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://checkout.razorpay.com",
    ]);
    expect(dev.get("script-src")).toContain("'unsafe-eval'");
  });

  it("blocks plugins, base hijacking, foreign form posts and framing", () => {
    expect(prod.get("object-src")).toEqual(["'none'"]);
    expect(prod.get("base-uri")).toEqual(["'self'"]);
    expect(prod.get("form-action")).toEqual(["'self'"]);
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("upgrades insecure requests only over HTTPS, and allows hot reload only in development", () => {
    expect(prod.has("upgrade-insecure-requests")).toBe(true);
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
    expect(prod.get("connect-src")).not.toContain("ws:");
    expect(dev.get("connect-src")).toContain("ws:");
  });
});
