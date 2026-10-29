// Content-Security-Policy (6.9, D-063). Sent from next.config.ts with every response.
//
// No nonces: a nonce needs every page rendered per request, which would undo the cached public
// pages (D-058). So inline scripts stay allowed (Next.js streams page data in inline scripts, and
// the theme script runs before paint); what the policy blocks is scripts, frames and requests
// to any other site, plugins, <base> hijacking, forms posting elsewhere and being framed.
// Third parties: Razorpay Checkout only. Add an origin here when an integration needs one.

const RAZORPAY = ["https://checkout.razorpay.com", "https://api.razorpay.com"];

export function contentSecurityPolicy(options: { dev: boolean; https: boolean }): string {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'",
      // React's dev build uses eval for error overlays; production never does.
      ...(options.dev ? ["'unsafe-eval'"] : []),
      "https://checkout.razorpay.com",
    ],
    "style-src": ["'self'", "'unsafe-inline'"],
    // Content may embed images from other sites (Markdown image links).
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      "https://*.razorpay.com",
      ...(options.dev ? ["ws:", "wss:"] : []), // hot reload
    ],
    "frame-src": RAZORPAY,
    "worker-src": ["'self'", "blob:"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  const policy = Object.entries(directives).map(([name, values]) => `${name} ${values.join(" ")}`);
  // Only over HTTPS: on http://localhost it would send every request to https and break.
  if (options.https) policy.push("upgrade-insecure-requests");
  return policy.join("; ");
}
