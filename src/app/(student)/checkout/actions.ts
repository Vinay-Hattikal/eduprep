"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { formatRupees } from "@/lib/commerce/pricing";
import { requirePermission } from "@/server/auth";
import { mockWebhook } from "@/server/integrations/payments/mock";
import {
  confirmCheckout,
  createOrder,
  getOrder,
  handlePaymentWebhook,
  quoteOrder,
} from "@/server/services/commerce";
import { env } from "@/server/env";

const requestSchema = z.object({
  kind: z.enum(["PRO", "COMPANY_PACK", "INTERVIEW_CREDITS"]),
  ref: z.string().min(1).max(80),
  quantity: z.number().int().min(1).max(5).optional(),
  code: z.string().max(40).nullable().optional(),
});

export type QuoteView =
  | {
      ok: true;
      label: string;
      list: string;
      discount: string | null;
      total: string;
      codeLabel: string | null;
    }
  | { ok: false; error: string; field?: "code" };

export async function quoteAction(input: z.input<typeof requestSchema>): Promise<QuoteView> {
  const user = await requirePermission("student.access");
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "This product isn't available." };
  const result = await quoteOrder(user, parsed.data);
  if (!result.ok) return result;
  return {
    ok: true,
    label: result.product.label,
    list: formatRupees(result.quote.listPaise),
    discount: result.quote.discountPaise ? formatRupees(result.quote.discountPaise) : null,
    total: formatRupees(result.quote.totalPaise),
    codeLabel: result.code
      ? `${result.code.code} (${result.code.kind === "coupon" ? "coupon" : "referral"})`
      : null,
  };
}

export type PlaceState = { error?: string; field?: "code" };

export async function placeOrderAction(input: z.input<typeof requestSchema>): Promise<PlaceState> {
  const user = await requirePermission("student.access");
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: "This product isn't available." };
  const result = await createOrder(user, parsed.data);
  if (!result.ok) return { error: result.error, field: result.field };
  redirect(result.checkoutPath);
}

/**
 * The mock bank (D-040): sends a signed webhook through the same handler a real provider's
 * webhook uses. Only available with the mock payment driver.
 */
export async function simulatePaymentAction(orderId: string, outcome: "success" | "failure") {
  const user = await requirePermission("student.access");
  if (env().PAYMENT_DRIVER !== "mock")
    throw new Error("Test payments are only available with the mock provider.");
  const order = await getOrder(user.id, z.string().max(40).parse(orderId));
  if (!order) redirect("/account");
  const { body, headers } = mockWebhook({
    type: outcome === "success" ? "payment.captured" : "payment.failed",
    providerOrderId: order.providerOrderId,
    providerPaymentId: outcome === "success" ? `mock_pay_${order.id}` : null,
    amountPaise: order.totalPaise,
    reason: outcome === "failure" ? "The bank declined the payment (test)." : undefined,
  });
  await handlePaymentWebhook(body, headers);
  redirect(`/checkout/${order.id}`);
}

const callbackSchema = z.object({
  providerOrderId: z.string().min(1).max(100),
  providerPaymentId: z.string().min(1).max(100),
  signature: z.string().regex(/^[a-f0-9]{64}$/),
});

/**
 * Razorpay's checkout callback. The signature is checked and the payment confirmed with
 * Razorpay before anything is granted; the webhook for the same payment is then a duplicate.
 */
export async function confirmCheckoutAction(
  orderId: string,
  callback: z.input<typeof callbackSchema>,
) {
  const user = await requirePermission("student.access");
  const parsed = callbackSchema.safeParse(callback);
  const id = z.string().max(40).parse(orderId);
  const outcome = parsed.success ? await confirmCheckout(user.id, id, parsed.data) : "invalid";
  // "invalid" here usually means the payment isn't captured yet; the webhook will confirm it.
  redirect(`/checkout/${id}${outcome === "invalid" ? "?processing=1" : ""}`);
}
