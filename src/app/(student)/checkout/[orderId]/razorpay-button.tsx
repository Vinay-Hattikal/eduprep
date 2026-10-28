"use client";

import Script from "next/script";
import { useState, useTransition } from "react";
import { confirmCheckoutAction } from "@/app/(student)/checkout/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

type RazorpayResponse = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayInstance = {
  open(): void;
  on(event: "payment.failed", handler: (r: { error: { description?: string } }) => void): void;
};

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

/** Opens Razorpay Standard Checkout (UPI, cards, net banking, wallets) for an order. */
export function RazorpayButton({
  orderId,
  keyId,
  providerOrderId,
  amountPaise,
  label,
  appName,
  prefill,
}: {
  orderId: string;
  keyId: string;
  providerOrderId: string;
  amountPaise: number;
  label: string;
  appName: string;
  prefill: { name: string; email: string | null; contact: string | null };
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, startConfirm] = useTransition();

  const open = () => {
    if (!window.Razorpay) return;
    setError(null);
    const checkout = new window.Razorpay({
      key: keyId,
      order_id: providerOrderId,
      amount: amountPaise,
      currency: "INR",
      name: appName,
      description: label,
      prefill: {
        name: prefill.name,
        email: prefill.email ?? undefined,
        contact: prefill.contact ?? undefined,
      },
      theme: {
        color:
          getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() ||
          undefined,
      },
      handler: (response: RazorpayResponse) =>
        startConfirm(async () => {
          await confirmCheckoutAction(orderId, {
            providerOrderId: response.razorpay_order_id,
            providerPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
        }),
    });
    checkout.on("payment.failed", (r) =>
      setError(r.error.description ?? "The payment didn't go through. Nothing was charged."),
    );
    checkout.open();
  };

  return (
    <div className="space-y-3">
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="button"
        size="lg"
        className="w-full"
        disabled={!ready || confirming}
        onClick={open}
        data-testid="razorpay-pay"
      >
        {confirming
          ? "Confirming your payment…"
          : ready
            ? "Pay securely"
            : "Loading payment options…"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Payments are processed by Razorpay. We never see your card or UPI PIN.
      </p>
    </div>
  );
}
