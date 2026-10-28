// Razorpay (D-044): Orders API, Standard Checkout in the browser, signed webhooks, refunds.
// Docs: razorpay.com/docs/payments/payment-gateway/web-integration/standard/
//
// Two ways a payment is confirmed, both idempotent through the same event handler:
//   1. the checkout callback: we check razorpay_signature = HMAC(order_id|payment_id, key secret)
//      and then fetch the payment to confirm it is captured for the right amount;
//   2. the webhook (payment.captured / payment.failed / refund.processed), signed with the
//      webhook secret (X-Razorpay-Signature), with a unique X-Razorpay-Event-Id.
// Configure the Razorpay dashboard to auto-capture payments.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentEvent, PaymentProvider } from "@/server/integrations/payments/types";

const API = "https://api.razorpay.com/v1";

export function hmacHex(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

type RazorpayPayment = {
  id: string;
  order_id: string;
  amount: number;
  status: string;
  error_description?: string | null;
};
type RazorpayRefund = { id: string; payment_id: string; amount: number };

type Webhook = {
  event: string;
  payload: { payment?: { entity: RazorpayPayment }; refund?: { entity: RazorpayRefund } };
};

/** Maps a verified webhook body to our event, or null for events we don't use. */
export function mapRazorpayWebhook(body: Webhook, eventId: string): PaymentEvent | null {
  const payment = body.payload.payment?.entity;
  if (!payment) return null;
  if (body.event === "payment.captured") {
    return {
      eventId,
      type: "payment.captured",
      providerOrderId: payment.order_id,
      providerPaymentId: payment.id,
      amountPaise: payment.amount,
    };
  }
  if (body.event === "payment.failed") {
    return {
      eventId,
      type: "payment.failed",
      providerOrderId: payment.order_id,
      providerPaymentId: payment.id,
      amountPaise: payment.amount,
      reason: payment.error_description ?? "Payment failed",
    };
  }
  if (body.event === "refund.processed" && body.payload.refund) {
    return {
      eventId,
      type: "refund.processed",
      providerOrderId: payment.order_id,
      providerPaymentId: payment.id,
      amountPaise: body.payload.refund.entity.amount,
    };
  }
  return null;
}

export function createRazorpayProvider(config: {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}): PaymentProvider {
  const auth = `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`;

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok)
      throw new Error(
        `Razorpay ${method} ${path} failed: ${response.status} ${(await response.text()).slice(0, 300)}`,
      );
    return (await response.json()) as T;
  }

  return {
    name: "razorpay",
    async createOrder({ orderId, amountPaise, receipt }) {
      const order = await call<{ id: string }>("POST", "/orders", {
        amount: amountPaise,
        currency: "INR",
        receipt: receipt.slice(0, 40),
        notes: { orderId },
      });
      return { providerOrderId: order.id };
    },
    checkoutPath(orderId) {
      return `/checkout/${orderId}`;
    },
    clientCheckout(order) {
      return {
        kind: "razorpay",
        keyId: config.keyId,
        providerOrderId: order.providerOrderId,
        amountPaise: order.totalPaise,
        currency: "INR",
      };
    },
    async parseWebhook(rawBody, headers) {
      const signature = headers.get("x-razorpay-signature");
      const eventId = headers.get("x-razorpay-event-id");
      if (!signature || !eventId) return null;
      if (!safeEqualHex(hmacHex(config.webhookSecret, rawBody), signature)) return null;
      try {
        return mapRazorpayWebhook(JSON.parse(rawBody) as Webhook, eventId);
      } catch {
        return null;
      }
    },
    async verifyCheckout({ providerOrderId, providerPaymentId, signature }) {
      if (
        !safeEqualHex(
          hmacHex(config.keySecret, `${providerOrderId}|${providerPaymentId}`),
          signature,
        )
      )
        return null;
      const payment = await call<RazorpayPayment>(
        "GET",
        `/payments/${encodeURIComponent(providerPaymentId)}`,
      );
      // Authorized-but-not-captured payments are confirmed later by the webhook.
      if (payment.order_id !== providerOrderId || payment.status !== "captured") return null;
      return {
        eventId: `checkout:${payment.id}`,
        type: "payment.captured",
        providerOrderId,
        providerPaymentId: payment.id,
        amountPaise: payment.amount,
      };
    },
    async refund({ providerPaymentId, amountPaise }) {
      const refund = await call<{ id: string }>(
        "POST",
        `/payments/${encodeURIComponent(providerPaymentId)}/refund`,
        { amount: amountPaise },
      );
      return { refundId: refund.id };
    },
  };
}
