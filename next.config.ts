import type { NextConfig } from "next";

// Content imports upload files up to 25 MB through a server action (data-import.md).
// Leave room for multipart overhead.
const UPLOAD_LIMIT = "26mb";

// Sent with every response (D-047). Content-Security-Policy is left out for now: Razorpay
// Checkout, KaTeX and the theme script need a tuned policy; add it after a report-only trial.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")',
  },
  ...(process.env.APP_ENV === "production" || process.env.APP_ENV === "staging"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  // BullMQ loads Lua scripts from its package folder at run time, so it isn't bundled.
  serverExternalPackages: ["bullmq", "ioredis"],
  experimental: {
    serverActions: { bodySizeLimit: UPLOAD_LIMIT },
    // proxy.ts runs on /admin, so it buffers request bodies; allow the same size.
    proxyClientMaxBodySize: UPLOAD_LIMIT,
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
