// Mock payment provider for development and tests (D-040). It behaves like Razorpay where it
// matters: orders get a provider id, and payments are reported by HMAC-signed webhook events
// that go through the same handler a real webhook would. The test checkout page lets you
// simulate success or failure. Refused in production (env.ts).

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import type {
  HeaderLookup,
  PaymentEvent,
  PaymentProvider,
} from "@/server/integrations/payments/types";

export const MOCK_SIGNATURE_HEADER = "x-mock-signature";

const secret = () => `${env().AUTH_SECRET}:mock-payments`;

export function signMockEvent(rawBody: string): string {
  return createHmac("sha256", secret()).update(rawBody).digest("hex");
}

/** Builds a signed event, as the mock "bank" would send it. */
export function mockWebhook(event: Omit<PaymentEvent, "eventId"> & { eventId?: string }) {
  const body = JSON.stringify({
    eventId: event.eventId ?? `evt_${randomBytes(8).toString("hex")}`,
    ...event,
  });
  const signature = signMockEvent(body);
  return { body, signature, headers: mockHeaders(signature) };
}

export function mockHeaders(signature: string): HeaderLookup {
  return new Headers({ [MOCK_SIGNATURE_HEADER]: signature });
}

export function createMockPaymentProvider(): PaymentProvider {
  return {
    name: "mock",
    async createOrder() {
      return { providerOrderId: `mock_order_${randomBytes(9).toString("hex")}` };
    },
    checkoutPath(orderId) {
      return `/checkout/${orderId}`;
    },
    clientCheckout() {
      return { kind: "mock" };
    },
    async parseWebhook(rawBody, headers) {
      const signature = headers.get(MOCK_SIGNATURE_HEADER);
      if (!signature) return null;
      const expected = Buffer.from(signMockEvent(rawBody), "hex");
      const given = Buffer.from(signature, "hex");
      if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
      try {
        const event = JSON.parse(rawBody) as PaymentEvent;
        return typeof event.eventId === "string" && typeof event.providerOrderId === "string"
          ? event
          : null;
      } catch {
        return null;
      }
    },
    async verifyCheckout() {
      return null; // the mock bank reports through webhooks only
    },
    async refund() {
      return { refundId: `mock_refund_${randomBytes(8).toString("hex")}` };
    },
  };
}
