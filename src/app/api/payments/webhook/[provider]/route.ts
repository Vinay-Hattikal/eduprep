// Payment provider webhooks (D-040, D-044). Point Razorpay's dashboard webhook at
// /api/payments/webhook/razorpay (events: payment.captured, payment.failed, refund.processed).
// The provider verifies the signature before anything happens; events are recorded once, so
// retries are safe.

import { NextResponse } from "next/server";
import { env } from "@/server/env";
import { handlePaymentWebhook } from "@/server/services/commerce";

export async function POST(
  request: Request,
  { params }: RouteContext<"/api/payments/webhook/[provider]">,
) {
  const { provider } = await params;
  if (provider !== env().PAYMENT_DRIVER)
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  const raw = await request.text();
  const outcome = await handlePaymentWebhook(raw, request.headers);
  if (outcome === "invalid")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  // Any other outcome (including duplicates) is acknowledged so the provider stops retrying.
  return NextResponse.json({ ok: true, outcome });
}
