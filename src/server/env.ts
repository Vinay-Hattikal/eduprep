// Validated server environment. Read env vars through this module only (rules.md section 4).
// Not marked `server-only` because proxy.ts imports it; it holds secrets, so never import it
// from a Client Component.
//
// Every external service has a development driver (the default) and a real one. Switching to
// the real one requires its credentials, checked here at startup (D-043).

import { z } from "zod";

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z
  .object({
    APP_ENV: z.enum(["local", "test", "staging", "production"]).default("local"),
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
    // dev: the /dev-login user picker is available next to real sign-in. live: real sign-in only.
    AUTH_MODE: z.enum(["dev", "live"]).default("dev"),
    // Local testing only: no sign-in codes (email confirmed on sign-up, phone OTP hidden) and no
    // payments (everyone has full access, interviews book for free). Refused in production.
    TEST_MODE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    // Payments (D-040, D-044)
    PAYMENT_DRIVER: z.enum(["mock", "razorpay"]).default("mock"),
    RAZORPAY_KEY_ID: optional,
    RAZORPAY_KEY_SECRET: optional,
    RAZORPAY_WEBHOOK_SECRET: optional,

    // Meetings (D-041)
    MEETING_DRIVER: z.enum(["mock", "google"]).default("mock"),
    GOOGLE_SERVICE_ACCOUNT_EMAIL: optional,
    GOOGLE_PRIVATE_KEY: optional,
    // The Google Workspace user whose calendar holds the events (domain-wide delegation).
    GOOGLE_CALENDAR_OWNER: optional,
    GOOGLE_CALENDAR_ID: z.string().default("primary"),

    // Messages (D-041, D-045): "outbox" keeps them in the database (and .data/mail) only.
    EMAIL_DRIVER: z.enum(["outbox", "resend"]).default("outbox"),
    RESEND_API_KEY: optional,
    // Defaults to "<product name> <no-reply@…>" from siteConfig; set to your verified domain.
    EMAIL_FROM: optional,
    SMS_DRIVER: z.enum(["outbox", "msg91"]).default("outbox"),
    MSG91_AUTH_KEY: optional,
    MSG91_OTP_TEMPLATE_ID: optional,
    WHATSAPP_DRIVER: z.enum(["outbox", "cloud"]).default("outbox"),
    WHATSAPP_TOKEN: optional,
    WHATSAPP_PHONE_NUMBER_ID: optional,
    WHATSAPP_TEMPLATE: z.string().default("account_update"),

    // Background jobs (D-029, D-046)
    QUEUE_DRIVER: z.enum(["postgres", "bullmq"]).default("postgres"),
    REDIS_URL: optional,
  })
  .superRefine((env, ctx) => {
    const need = (when: boolean, keys: (keyof typeof env)[], message: string, path: string) => {
      if (when && keys.some((k) => !env[k]))
        ctx.addIssue({ code: "custom", path: [path], message });
    };
    const production = env.APP_ENV === "production";
    if (production && env.AUTH_MODE === "dev") {
      ctx.addIssue({
        code: "custom",
        path: ["AUTH_MODE"],
        message: "AUTH_MODE=dev is not allowed when APP_ENV=production (D-020)",
      });
    }
    if (production && env.TEST_MODE) {
      ctx.addIssue({
        code: "custom",
        path: ["TEST_MODE"],
        message: "TEST_MODE=true is not allowed when APP_ENV=production",
      });
    }
    if (production && env.PAYMENT_DRIVER === "mock") {
      ctx.addIssue({
        code: "custom",
        path: ["PAYMENT_DRIVER"],
        message: "PAYMENT_DRIVER=mock is not allowed when APP_ENV=production (D-040)",
      });
    }
    need(
      env.PAYMENT_DRIVER === "razorpay",
      ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
      "PAYMENT_DRIVER=razorpay needs RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET",
      "PAYMENT_DRIVER",
    );
    need(
      env.MEETING_DRIVER === "google",
      ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY", "GOOGLE_CALENDAR_OWNER"],
      "MEETING_DRIVER=google needs GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_CALENDAR_OWNER",
      "MEETING_DRIVER",
    );
    need(
      env.EMAIL_DRIVER === "resend",
      ["RESEND_API_KEY"],
      "EMAIL_DRIVER=resend needs RESEND_API_KEY",
      "EMAIL_DRIVER",
    );
    need(
      env.SMS_DRIVER === "msg91",
      ["MSG91_AUTH_KEY", "MSG91_OTP_TEMPLATE_ID"],
      "SMS_DRIVER=msg91 needs MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID",
      "SMS_DRIVER",
    );
    need(
      env.WHATSAPP_DRIVER === "cloud",
      ["WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
      "WHATSAPP_DRIVER=cloud needs WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID",
      "WHATSAPP_DRIVER",
    );
    need(
      env.QUEUE_DRIVER === "bullmq",
      ["REDIS_URL"],
      "QUEUE_DRIVER=bullmq needs REDIS_URL",
      "QUEUE_DRIVER",
    );
  });

export type Env = z.infer<typeof schema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}\nSee .env.example.`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Parsed lazily so that importing a module doesn't fail at build time for unrelated routes. */
export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
