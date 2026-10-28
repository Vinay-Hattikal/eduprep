// Payment provider interface (D-040, D-044): a mock provider for development and tests, and
// Razorpay. Access is granted only from a verified event: a signed webhook, or a checkout
// callback whose signature checks out and whose payment the provider confirms as captured.

export type PaymentEventType = "payment.captured" | "payment.failed" | "refund.processed";

export type PaymentEvent = {
  /** Unique per event: webhooks are retried, handling must be idempotent. */
  eventId: string;
  type: PaymentEventType;
  providerOrderId: string;
  providerPaymentId: string | null;
  amountPaise: number;
  reason?: string;
};

export type HeaderLookup = { get(name: string): string | null };

/** What the browser needs to open the provider's checkout. */
export type ClientCheckout =
  | { kind: "mock" }
  | {
      kind: "razorpay";
      keyId: string;
      providerOrderId: string;
      amountPaise: number;
      currency: "INR";
    };

export type CheckoutCallback = {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
};

export interface PaymentProvider {
  readonly name: string;
  /** Registers an order with the provider. */
  createOrder(input: {
    orderId: string;
    amountPaise: number;
    receipt: string;
  }): Promise<{ providerOrderId: string }>;
  /** Our page where the buyer pays. */
  checkoutPath(orderId: string): string;
  /** Options for the in-browser checkout. */
  clientCheckout(order: { providerOrderId: string; totalPaise: number }): ClientCheckout;
  /** Checks the webhook signature and parses the event. Null when it isn't authentic. */
  parseWebhook(rawBody: string, headers: HeaderLookup): Promise<PaymentEvent | null>;
  /** Verifies the browser's "payment done" callback with the provider. Null when unverified. */
  verifyCheckout(callback: CheckoutCallback): Promise<PaymentEvent | null>;
  /** Refunds a captured payment (full or partial). */
  refund(input: { providerPaymentId: string; amountPaise: number }): Promise<{ refundId: string }>;
}
