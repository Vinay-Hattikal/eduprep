import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isValidEmail,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizeIndianPhone,
  passwordProblem,
} from "@/lib/auth/credentials";
import {
  codeMatches,
  DUMMY_HASH,
  generateCode,
  hashCode,
  hashPassword,
  verifyPassword,
} from "@/server/auth/secrets";
import { parseEnv } from "@/server/env";
import { redisConnection } from "@/server/jobs/dispatch";
import {
  createMsg91Transport,
  createResendTransport,
  createWhatsAppTransport,
} from "@/server/integrations/notify";
import {
  createRazorpayProvider,
  hmacHex,
  mapRazorpayWebhook,
} from "@/server/integrations/payments/razorpay";

afterEach(() => vi.unstubAllGlobals());

describe("credentials", () => {
  it("normalises Indian mobile numbers", () => {
    for (const input of [
      "9876543210",
      "+91 98765 43210",
      "919876543210",
      "09876543210",
      "98765-43210",
    ]) {
      expect(normalizeIndianPhone(input)).toBe("+919876543210");
    }
    for (const input of ["5876543210", "987654321", "+1 9876543210", "abc"])
      expect(normalizeIndianPhone(input)).toBeNull();
  });

  it("checks emails and passwords", () => {
    expect(normalizeEmail("  Ravi@Example.COM ")).toBe("ravi@example.com");
    expect(isValidEmail("ravi@example.com")).toBe(true);
    expect(isValidEmail("ravi@example")).toBe(false);
    expect(passwordProblem("short")).toMatch(/8 characters/);
    expect(passwordProblem("password123")).toMatch(/common/);
    expect(passwordProblem("aaaaaaaaaa")).toMatch(/repeat/);
    expect(passwordProblem("ravikumar2026", { email: "ravikumar@example.com" })).toMatch(/email/);
    expect(passwordProblem("blue-river-42")).toBeNull();
  });

  it("masks contact details", () => {
    expect(maskEmail("ravi@example.com")).toBe("ra••@example.com");
    expect(maskPhone("+919876543210")).toBe("+91 •••••3210");
  });
});

describe("secrets", () => {
  it("hashes and verifies passwords with scrypt", async () => {
    const hash = await hashPassword("blue-river-42");
    expect(hash).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(await verifyPassword("blue-river-42", hash)).toBe(true);
    expect(await verifyPassword("blue-river-43", hash)).toBe(false);
    expect(await hashPassword("blue-river-42")).not.toBe(hash); // salted
    expect(await verifyPassword("anything", DUMMY_HASH)).toBe(false);
    expect(await verifyPassword("anything", "md5$abc")).toBe(false);
  });

  it("generates 6-digit codes and matches them by hash only", () => {
    const codes = new Set(Array.from({ length: 50 }, generateCode));
    expect([...codes].every((c) => /^\d{6}$/.test(c))).toBe(true);
    expect(codes.size).toBeGreaterThan(40);
    const hash = hashCode("123456", "secret");
    expect(codeMatches("123456", hash, "secret")).toBe(true);
    expect(codeMatches("123457", hash, "secret")).toBe(false);
    expect(codeMatches("123456", hash, "other")).toBe(false);
  });
});

describe("environment", () => {
  const base = { DATABASE_URL: "postgresql://x", AUTH_SECRET: "x".repeat(32) };
  it("requires credentials for real providers", () => {
    expect(() => parseEnv({ ...base, PAYMENT_DRIVER: "razorpay" })).toThrow(/RAZORPAY_KEY_ID/);
    expect(() => parseEnv({ ...base, EMAIL_DRIVER: "resend" })).toThrow(/RESEND_API_KEY/);
    expect(() => parseEnv({ ...base, SMS_DRIVER: "msg91", MSG91_AUTH_KEY: "k" })).toThrow(
      /MSG91_OTP_TEMPLATE_ID/,
    );
    expect(() => parseEnv({ ...base, QUEUE_DRIVER: "bullmq" })).toThrow(/REDIS_URL/);
    expect(
      parseEnv({ ...base, QUEUE_DRIVER: "bullmq", REDIS_URL: "redis://localhost:6379" })
        .QUEUE_DRIVER,
    ).toBe("bullmq");
  });

  it("refuses development drivers in production", () => {
    expect(() => parseEnv({ ...base, APP_ENV: "production", AUTH_MODE: "live" })).toThrow(
      /PAYMENT_DRIVER=mock/,
    );
    expect(
      parseEnv({
        ...base,
        APP_ENV: "production",
        AUTH_MODE: "live",
        PAYMENT_DRIVER: "razorpay",
        RAZORPAY_KEY_ID: "rzp_live_x",
        RAZORPAY_KEY_SECRET: "s",
        RAZORPAY_WEBHOOK_SECRET: "w",
      }).PAYMENT_DRIVER,
    ).toBe("razorpay");
  });

  it("parses Redis URLs", () => {
    expect(redisConnection("rediss://default:p%40ss@cache.example.com:6380/2")).toMatchObject({
      host: "cache.example.com",
      port: 6380,
      username: "default",
      password: "p@ss",
      db: 2,
      tls: {},
    });
  });
});

describe("razorpay", () => {
  const provider = createRazorpayProvider({
    keyId: "rzp_test_key",
    keySecret: "key_secret",
    webhookSecret: "hook_secret",
  });
  const payment = { id: "pay_1", order_id: "order_1", amount: 29_900, status: "captured" };

  it("verifies webhook signatures and maps events", async () => {
    const body = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: payment } },
    });
    const headers = (signature: string) =>
      new Headers({ "x-razorpay-signature": signature, "x-razorpay-event-id": "evt_1" });
    expect(await provider.parseWebhook(body, headers(hmacHex("hook_secret", body)))).toEqual({
      eventId: "evt_1",
      type: "payment.captured",
      providerOrderId: "order_1",
      providerPaymentId: "pay_1",
      amountPaise: 29_900,
    });
    expect(await provider.parseWebhook(body, headers(hmacHex("wrong", body)))).toBeNull();
    expect(
      await provider.parseWebhook(
        body,
        new Headers({ "x-razorpay-signature": hmacHex("hook_secret", body) }),
      ),
    ).toBeNull();
  });

  it("maps failures and refunds, ignores other events", () => {
    expect(
      mapRazorpayWebhook(
        {
          event: "payment.failed",
          payload: {
            payment: {
              entity: { ...payment, status: "failed", error_description: "Bank declined" },
            },
          },
        },
        "e",
      ),
    ).toMatchObject({ type: "payment.failed", reason: "Bank declined" });
    expect(
      mapRazorpayWebhook(
        {
          event: "refund.processed",
          payload: {
            payment: { entity: payment },
            refund: { entity: { id: "rfnd_1", payment_id: "pay_1", amount: 10_000 } },
          },
        },
        "e",
      ),
    ).toMatchObject({ type: "refund.processed", providerOrderId: "order_1", amountPaise: 10_000 });
    expect(
      mapRazorpayWebhook({ event: "order.paid", payload: { payment: { entity: payment } } }, "e"),
    ).toBeNull();
  });

  it("confirms a checkout only with a valid signature and a captured payment", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(payment)));
    vi.stubGlobal("fetch", fetchMock);
    const signature = hmacHex("key_secret", "order_1|pay_1");
    expect(
      await provider.verifyCheckout({
        providerOrderId: "order_1",
        providerPaymentId: "pay_1",
        signature,
      }),
    ).toMatchObject({
      eventId: "checkout:pay_1",
      type: "payment.captured",
      amountPaise: 29_900,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.razorpay.com/v1/payments/pay_1",
      expect.anything(),
    );
    expect(
      await provider.verifyCheckout({
        providerOrderId: "order_1",
        providerPaymentId: "pay_1",
        signature: "00".repeat(32),
      }),
    ).toBeNull();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...payment, status: "authorized" })),
    );
    expect(
      await provider.verifyCheckout({
        providerOrderId: "order_1",
        providerPaymentId: "pay_1",
        signature,
      }),
    ).toBeNull();
  });

  it("creates orders and refunds through the API with basic auth", async () => {
    const fetchMock = vi.fn(
      async (url: string | URL | Request) =>
        new Response(
          JSON.stringify(String(url).endsWith("/orders") ? { id: "order_9" } : { id: "rfnd_9" }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await provider.createOrder({ orderId: "o1", amountPaise: 29_900, receipt: "o1" }),
    ).toEqual({ providerOrderId: "order_9" });
    const [, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      amount: 29_900,
      currency: "INR",
      receipt: "o1",
      notes: { orderId: "o1" },
    });
    expect((init.headers as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("rzp_test_key:key_secret").toString("base64")}`,
    );
    expect(await provider.refund({ providerPaymentId: "pay_1", amountPaise: 100 })).toEqual({
      refundId: "rfnd_9",
    });
    expect(
      provider.clientCheckout({ providerOrderId: "order_9", totalPaise: 29_900 }),
    ).toMatchObject({ kind: "razorpay", keyId: "rzp_test_key" });
  });
});

describe("message transports", () => {
  const message = {
    id: "n1",
    channel: "EMAIL" as const,
    to: "ravi@example.com",
    subject: "Hi",
    body: "Hello https://x.example",
  };

  it("Resend sends text and HTML with an idempotency key", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    await createResendTransport("re_key", "App <no-reply@x.example>").send(message);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>)["Idempotency-Key"]).toBe("n1");
    expect(JSON.parse(String(init.body))).toMatchObject({
      to: ["ravi@example.com"],
      subject: "Hi",
      text: message.body,
    });
  });

  it("MSG91 sends the OTP template and refuses other SMS", async () => {
    const fetchMock = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const sms = createMsg91Transport("auth", "tmpl");
    await sms.send({
      ...message,
      channel: "SMS",
      to: "+919876543210",
      variables: { otp: "123456" },
    });
    expect(
      JSON.parse(String((fetchMock.mock.calls[0]! as unknown as [string, RequestInit])[1].body)),
    ).toEqual({
      template_id: "tmpl",
      short_url: "0",
      recipients: [{ mobiles: "919876543210", otp: "123456" }],
    });
    await expect(sms.send({ ...message, channel: "SMS" })).rejects.toThrow(/otp/);
  });

  it("WhatsApp uses the approved template and reports provider errors", async () => {
    const fetchMock = vi.fn(async () => new Response("bad", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      createWhatsAppTransport("tok", "123", "account_update").send({
        ...message,
        channel: "WHATSAPP",
        to: "+919876543210",
      }),
    ).rejects.toThrow(/401/);
    const body = JSON.parse(
      String((fetchMock.mock.calls[0]! as unknown as [string, RequestInit])[1].body),
    );
    expect(body).toMatchObject({
      to: "919876543210",
      type: "template",
      template: { name: "account_update" },
    });
  });
});
