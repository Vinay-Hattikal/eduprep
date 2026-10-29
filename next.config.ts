import type { NextConfig } from "next";
import { contentSecurityPolicy } from "./src/config/csp";

// Content imports upload files up to 25 MB through a server action (data-import.md).
// Leave room for multipart overhead.
const UPLOAD_LIMIT = "26mb";

const HTTPS = process.env.APP_ENV === "production" || process.env.APP_ENV === "staging";

// Sent with every response (D-047). The Content-Security-Policy is in src/config/csp.ts (D-063).
const SECURITY_HEADERS = [
  {
    key: "Content-Security-Policy",
    value: contentSecurityPolicy({ dev: process.env.NODE_ENV === "development", https: HTTPS }),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value:
      'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")',
  },
  ...(HTTPS
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
