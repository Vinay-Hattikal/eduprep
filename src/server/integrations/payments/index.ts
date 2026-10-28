// Picks the payment provider from PAYMENT_DRIVER: "mock" (development, tests) or "razorpay".

import { env } from "@/server/env";
import { createMockPaymentProvider } from "@/server/integrations/payments/mock";
import { createRazorpayProvider } from "@/server/integrations/payments/razorpay";
import type { PaymentProvider } from "@/server/integrations/payments/types";

let provider: PaymentProvider | null = null;

export function getPaymentProvider(): PaymentProvider {
  if (provider) return provider;
  const config = env();
  provider =
    config.PAYMENT_DRIVER === "razorpay"
      ? createRazorpayProvider({
          keyId: config.RAZORPAY_KEY_ID!,
          keySecret: config.RAZORPAY_KEY_SECRET!,
          webhookSecret: config.RAZORPAY_WEBHOOK_SECRET!,
        })
      : createMockPaymentProvider();
  return provider;
}

export type {
  CheckoutCallback,
  ClientCheckout,
  HeaderLookup,
  PaymentEvent,
  PaymentProvider,
} from "@/server/integrations/payments/types";
