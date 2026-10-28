import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import type { ProductKind } from "@/generated/prisma/enums";
import { nextPeriod } from "@/lib/commerce/access";
import {
  COMPANY_PACK_DAYS,
  couponProblem,
  CREDIT_BUNDLES,
  formatRupees,
  gstSplit,
  invoiceNumber,
  isCreditBundle,
  isProPlan,
  PRO_PLANS,
  quote,
  referralCodeFrom,
  type Quote,
} from "@/lib/commerce/pricing";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import {
  getPaymentProvider,
  type CheckoutCallback,
  type HeaderLookup,
  type PaymentEvent,
} from "@/server/integrations/payments";
import { recordAudit } from "@/server/services/audit";
import {
  getInterviewType,
  listInterviewTypes,
  type InterviewTypeView,
} from "@/server/services/interview-types";
import { notify } from "@/server/services/notifications";
import { getSetting } from "@/server/services/settings";

type Viewer = Pick<CurrentUser, "id" | "roles">;
type Actor = { id: string };

// ---------- Catalogue ----------

export async function getCatalog() {
  const [proMonthly, proHalfYearly, companyPack, bundle3, bundle5, gst, types] = await Promise.all([
    getSetting("pricing.proMonthly"),
    getSetting("pricing.proHalfYearly"),
    getSetting("pricing.companyPack"),
    getSetting("interviews.bundle3DiscountPercent"),
    getSetting("interviews.bundle5DiscountPercent"),
    getSetting("pricing.gstPercent"),
    listInterviewTypes(),
  ]);
  const bundlePercent = (q: number) => (q === 3 ? bundle3 : q === 5 ? bundle5 : 0);
  return {
    pro: { monthly: proMonthly, halfYearly: proHalfYearly },
    companyPack,
    gstPercent: gst,
    bundlePercent,
    interviews: types.map((t) => ({
      ...t,
      bundles: CREDIT_BUNDLES.map((quantity) => ({
        quantity,
        ...quote({ unitPaise: t.pricePaise, quantity, bundlePercent: bundlePercent(quantity) }),
      })),
    })),
  };
}

// ---------- Quotes and orders ----------

export type OrderRequest = {
  kind: ProductKind;
  /** PRO: plan; COMPANY_PACK: company slug or id; INTERVIEW_CREDITS: type slug or id. */
  ref: string;
  quantity?: number;
  code?: string | null;
};

type Product = {
  kind: ProductKind;
  productRef: string;
  label: string;
  quantity: number;
  unitPaise: number;
  bundlePercent: number;
  type?: InterviewTypeView;
};

async function resolveProduct(request: OrderRequest): Promise<Product | string> {
  if (request.kind === "PRO") {
    if (!isProPlan(request.ref)) return "Choose a Pro plan.";
    const plan = PRO_PLANS[request.ref];
    return {
      kind: "PRO",
      productRef: request.ref,
      label: plan.label,
      quantity: 1,
      unitPaise: await getSetting(plan.setting),
      bundlePercent: 0,
    };
  }
  if (request.kind === "COMPANY_PACK") {
    const company = await db.company.findFirst({
      where: { OR: [{ id: request.ref }, { slug: request.ref }], status: "PUBLISHED" },
      select: { id: true, name: true },
    });
    if (!company) return "This company isn't available.";
    return {
      kind: "COMPANY_PACK",
      productRef: company.id,
      label: `${company.name} pack, 6 months`,
      quantity: 1,
      unitPaise: await getSetting("pricing.companyPack"),
      bundlePercent: 0,
    };
  }
  const type = await getInterviewType(request.ref);
  if (!type || !type.active) return "This interview type isn't available.";
  const quantity = request.quantity ?? 1;
  if (!isCreditBundle(quantity)) return "Choose 1, 3 or 5 interviews.";
  const bundlePercent =
    quantity === 3
      ? await getSetting("interviews.bundle3DiscountPercent")
      : quantity === 5
        ? await getSetting("interviews.bundle5DiscountPercent")
        : 0;
  return {
    kind: "INTERVIEW_CREDITS",
    productRef: type.id,
    label: `${type.name} mock interview${quantity > 1 ? ` × ${quantity}` : ""}`,
    quantity,
    unitPaise: type.pricePaise,
    bundlePercent,
    type,
  };
}

export type QuoteResult =
  | {
      ok: true;
      product: Omit<Product, "type">;
      quote: Quote;
      code:
        | { kind: "coupon"; id: string; code: string }
        | { kind: "referral"; id: string; code: string }
        | null;
      gst: { taxablePaise: number; gstPaise: number; percent: number };
    }
  | { ok: false; error: string; field?: "code" };

/** Works out the price on the server. A code is a coupon, or someone else's referral code. */
export async function quoteOrder(
  user: Viewer,
  request: OrderRequest,
  now = new Date(),
): Promise<QuoteResult> {
  const product = await resolveProduct(request);
  if (typeof product === "string") return { ok: false, error: product };
  const code = request.code?.trim().toUpperCase() || null;
  let coupon = null;
  let referral = null;
  if (code) {
    coupon = await db.coupon.findUnique({ where: { code } });
    if (coupon) {
      const problem = couponProblem(coupon, product.kind, now);
      if (problem) return { ok: false, error: problem, field: "code" };
    } else {
      referral = await db.referralCode.findUnique({ where: { code } });
      if (!referral) return { ok: false, error: "That code isn't valid.", field: "code" };
      if (referral.userId === user.id)
        return { ok: false, error: "You can't use your own referral code.", field: "code" };
    }
  }
  const result = quote({
    unitPaise: product.unitPaise,
    quantity: product.quantity,
    bundlePercent: product.bundlePercent,
    coupon,
    referralPercent: referral ? await getSetting("referrals.discountPercent") : null,
  });
  const gstPercent = await getSetting("pricing.gstPercent");
  const { type: _type, ...rest } = product;
  return {
    ok: true,
    product: rest,
    quote: result,
    code: coupon
      ? { kind: "coupon", id: coupon.id, code: coupon.code }
      : referral
        ? { kind: "referral", id: referral.id, code: referral.code }
        : null,
    gst: { ...gstSplit(result.totalPaise, gstPercent), percent: gstPercent },
  };
}

export type CreateOrderResult =
  | { ok: true; orderId: string; checkoutPath: string }
  | { ok: false; error: string; field?: "code" };

/** Creates an order and registers it with the payment provider. Nothing is granted until paid. */
export async function createOrder(
  user: Viewer,
  request: OrderRequest,
  options: { bookingId?: string } = {},
  now = new Date(),
): Promise<CreateOrderResult> {
  const priced = await quoteOrder(user, request, now);
  if (!priced.ok) return priced;
  const provider = getPaymentProvider();
  const order = await db.order.create({
    data: {
      userId: user.id,
      kind: priced.product.kind,
      productRef: priced.product.productRef,
      quantity: priced.product.quantity,
      label: priced.product.label,
      listPaise: priced.quote.listPaise,
      discountPaise: priced.quote.discountPaise,
      totalPaise: priced.quote.totalPaise,
      couponId: priced.code?.kind === "coupon" ? priced.code.id : null,
      referralCodeId: priced.code?.kind === "referral" ? priced.code.id : null,
      provider: provider.name,
      providerOrderId: `pending_${crypto.randomUUID()}`,
    },
  });
  const registered = await provider.createOrder({
    orderId: order.id,
    amountPaise: order.totalPaise,
    receipt: order.id,
  });
  await db.order.update({
    where: { id: order.id },
    data: { providerOrderId: registered.providerOrderId },
  });
  if (options.bookingId) {
    await db.booking.update({ where: { id: options.bookingId }, data: { orderId: order.id } });
  }
  return { ok: true, orderId: order.id, checkoutPath: provider.checkoutPath(order.id) };
}

export async function getOrder(userId: string | null, orderId: string) {
  return db.order.findFirst({
    where: { id: orderId, ...(userId ? { userId } : {}) },
    include: {
      coupon: { select: { code: true } },
      booking: { select: { id: true, status: true } },
    },
  });
}

// ---------- Webhooks (the only way an order becomes paid) ----------

export type WebhookOutcome = "processed" | "duplicate" | "ignored" | "invalid";

export async function handlePaymentWebhook(
  rawBody: string,
  headers: HeaderLookup,
  now = new Date(),
): Promise<WebhookOutcome> {
  const event = await getPaymentProvider().parseWebhook(rawBody, headers);
  if (!event) return "invalid";
  return processPaymentEvent(event, safeJson(rawBody), now);
}

/**
 * The browser's "payment done" callback (Razorpay checkout). Verified with the provider, then
 * handled exactly like the webhook for the same payment (whichever arrives first wins).
 */
export async function confirmCheckout(
  userId: string,
  orderId: string,
  callback: CheckoutCallback,
  now = new Date(),
) {
  const order = await db.order.findFirst({ where: { id: orderId, userId } });
  if (!order || order.providerOrderId !== callback.providerOrderId) return "invalid" as const;
  const event = await getPaymentProvider().verifyCheckout(callback);
  if (!event) return "invalid" as const;
  return processPaymentEvent(event, { source: "checkout", ...callback, signature: undefined }, now);
}

function safeJson(raw: string): Prisma.InputJsonValue {
  try {
    return JSON.parse(raw) as Prisma.InputJsonValue;
  } catch {
    return { raw: raw.slice(0, 2000) };
  }
}

async function processPaymentEvent(
  event: PaymentEvent,
  payload: Prisma.InputJsonValue,
  now: Date,
): Promise<WebhookOutcome> {
  const provider = getPaymentProvider();
  // Record each event once; a retried webhook is acknowledged and skipped.
  try {
    await db.paymentEvent.create({
      data: { provider: provider.name, eventId: event.eventId, type: event.type, payload },
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return "duplicate";
    throw error;
  }

  const order = await db.order.findUnique({ where: { providerOrderId: event.providerOrderId } });
  if (!order) return "ignored";

  if (event.type === "payment.failed") {
    await db.order.updateMany({
      where: { id: order.id, status: "CREATED" },
      data: { status: "FAILED", failureReason: event.reason ?? "Payment failed" },
    });
    return "processed";
  }
  if (event.type === "refund.processed") {
    await markRefunded(order.id, event.amountPaise, now);
    return "processed";
  }

  // payment.captured
  if (event.amountPaise !== order.totalPaise) {
    await db.order.update({
      where: { id: order.id },
      data: { failureReason: `Amount mismatch: ${event.amountPaise}` },
    });
    return "ignored";
  }
  const paid = await db.$transaction(async (tx) => {
    // Claim the order: only one event can move it to PAID (a failed order can still be paid).
    const claimed = await tx.order.updateMany({
      where: { id: order.id, status: { in: ["CREATED", "FAILED"] } },
      data: {
        status: "PAID",
        paidAt: now,
        providerPaymentId: event.providerPaymentId,
        failureReason: null,
      },
    });
    if (!claimed.count) return false;
    const [{ nextval }] = await tx.$queryRaw<
      { nextval: bigint }[]
    >`SELECT nextval('invoice_number_seq')`;
    await tx.order.update({
      where: { id: order.id },
      data: { invoiceNo: invoiceNumber(Number(nextval), now) },
    });
    await fulfil(tx, order, now);
    return true;
  });
  if (!paid) return "duplicate";

  const fresh = await db.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { booking: true, user: { select: { name: true } } },
  });
  await notify(order.userId, "purchase.receipt", {
    name: fresh.user.name,
    label: fresh.label,
    totalRupees: formatRupees(fresh.totalPaise),
    invoiceNo: fresh.invoiceNo!,
    orderId: fresh.id,
  });
  // Paid for a held interview slot: use the new credit for it now.
  if (fresh.booking) {
    const { confirmPaidBooking } = await import("@/server/services/interviews");
    await confirmPaidBooking(fresh.booking.id, now);
  }
  return "processed";
}

/** Grants what an order bought. Runs inside the payment transaction. */
async function fulfil(
  tx: Prisma.TransactionClient,
  order: Prisma.OrderGetPayload<object>,
  now: Date,
) {
  if (order.kind === "PRO" || order.kind === "COMPANY_PACK") {
    const days =
      order.kind === "PRO"
        ? PRO_PLANS[order.productRef as keyof typeof PRO_PLANS].days
        : COMPANY_PACK_DAYS;
    const companyId = order.kind === "COMPANY_PACK" ? order.productRef : null;
    const current = await tx.entitlement.findMany({
      where: {
        userId: order.userId,
        kind: order.kind,
        companyId,
        revokedAt: null,
        endsAt: { gt: now },
      },
      select: { endsAt: true },
    });
    await tx.entitlement.create({
      data: {
        userId: order.userId,
        kind: order.kind,
        companyId,
        orderId: order.id,
        ...nextPeriod(
          current.map((e) => e.endsAt),
          now,
          days,
        ),
      },
    });
  } else {
    await tx.interviewCredit.createMany({
      data: Array.from({ length: order.quantity }, () => ({
        userId: order.userId,
        typeId: order.productRef,
        orderId: order.id,
      })),
    });
  }
  if (order.couponId)
    await tx.coupon.update({
      where: { id: order.couponId },
      data: { redemptions: { increment: 1 } },
    });
  if (order.referralCodeId) {
    const referral = await tx.referralCode.findUniqueOrThrow({
      where: { id: order.referralCodeId },
    });
    const points = await getSetting("referrals.rewardPoints");
    await tx.userStats.upsert({
      where: { userId: referral.userId },
      create: { userId: referral.userId, points },
      update: { points: { increment: points } },
    });
  }
}

async function markRefunded(orderId: string, amountPaise: number, now: Date) {
  await db.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: "PAID" },
      data: { status: "REFUNDED", refundedAt: now, refundPaise: amountPaise },
    });
    if (!claimed.count) return;
    await tx.entitlement.updateMany({
      where: { orderId, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.interviewCredit.updateMany({
      where: { orderId, status: "AVAILABLE" },
      data: { status: "REVOKED" },
    });
  });
}

// ---------- Support: refunds and grants ----------

export async function refundOrder(orderId: string, actor: Actor, reason: string, now = new Date()) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { credits: true } });
  if (!order || order.status !== "PAID" || !order.providerPaymentId)
    return { ok: false as const, error: "Only paid orders can be refunded." };
  if (order.credits.some((c) => c.status === "USED")) {
    return {
      ok: false as const,
      error:
        "Some interview credits from this order were used. Cancel those bookings first, or refund manually.",
    };
  }
  await getPaymentProvider().refund({
    providerPaymentId: order.providerPaymentId,
    amountPaise: order.totalPaise,
  });
  await markRefunded(order.id, order.totalPaise, now);
  await recordAudit({
    actorId: actor.id,
    action: "order.refund",
    entityType: "order",
    entityId: order.id,
    after: { amountPaise: order.totalPaise, reason },
  });
  return { ok: true as const };
}

export type Grant =
  | { kind: "PRO"; days: number }
  | { kind: "COMPANY_PACK"; companyId: string; days: number }
  | { kind: "CREDITS"; typeId: string; quantity: number };

/** Support grants access by hand (goodwill, partnerships, fixes). Always audited. */
export async function grantAccess(
  userId: string,
  grant: Grant,
  actor: Actor,
  note: string,
  now = new Date(),
) {
  await db.$transaction(async (tx) => {
    if (grant.kind === "CREDITS") {
      await tx.interviewCredit.createMany({
        data: Array.from({ length: grant.quantity }, () => ({
          userId,
          typeId: grant.typeId,
          grantedById: actor.id,
          note,
        })),
      });
    } else {
      const companyId = grant.kind === "COMPANY_PACK" ? grant.companyId : null;
      const current = await tx.entitlement.findMany({
        where: { userId, kind: grant.kind, companyId, revokedAt: null, endsAt: { gt: now } },
        select: { endsAt: true },
      });
      await tx.entitlement.create({
        data: {
          userId,
          kind: grant.kind,
          companyId,
          grantedById: actor.id,
          note,
          ...nextPeriod(
            current.map((e) => e.endsAt),
            now,
            grant.days,
          ),
        },
      });
    }
    await recordAudit(
      {
        actorId: actor.id,
        action: "access.grant",
        entityType: "user",
        entityId: userId,
        after: { ...grant, note },
      },
      tx,
    );
  });
}

export async function revokeEntitlement(entitlementId: string, actor: Actor, now = new Date()) {
  const row = await db.entitlement.update({
    where: { id: entitlementId },
    data: { revokedAt: now },
  });
  await recordAudit({
    actorId: actor.id,
    action: "access.revoke",
    entityType: "user",
    entityId: row.userId,
    after: { entitlementId },
  });
}

// ---------- Account ----------

export async function ensureReferralCode(userId: string, name: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.referralCode.findUnique({ where: { userId } });
    if (existing) return existing.code;
    try {
      return (await db.referralCode.create({ data: { userId, code: referralCodeFrom(name) } }))
        .code;
    } catch (error) {
      // Another request created this user's code at the same moment, or the random code was
      // taken: read again and retry.
      if ((error as { code?: string }).code !== "P2002") throw error;
    }
  }
  throw new Error("Couldn't create a referral code");
}

export async function getAccount(user: Pick<CurrentUser, "id" | "name">, now = new Date()) {
  const [orders, entitlements, credits, stats, referralCode] = await Promise.all([
    db.order.findMany({
      where: { userId: user.id, status: { in: ["PAID", "REFUNDED"] } },
      orderBy: { createdAt: "desc" },
    }),
    db.entitlement.findMany({
      where: { userId: user.id },
      orderBy: { endsAt: "desc" },
      include: { company: { select: { name: true, slug: true } } },
    }),
    db.interviewCredit.groupBy({
      by: ["typeId", "status"],
      where: { userId: user.id },
      _count: { _all: true },
    }),
    db.userStats.findUnique({ where: { userId: user.id }, select: { points: true } }),
    ensureReferralCode(user.id, user.name),
  ]);
  const types = await listInterviewTypes({ includeInactive: true });
  return {
    orders,
    active: entitlements.filter((e) => !e.revokedAt && e.endsAt > now && e.startsAt <= now),
    upcoming: entitlements.filter((e) => !e.revokedAt && e.startsAt > now),
    past: entitlements.filter((e) => e.revokedAt || e.endsAt <= now),
    credits: types
      .map((t) => ({
        type: t,
        available:
          credits.find((c) => c.typeId === t.id && c.status === "AVAILABLE")?._count._all ?? 0,
        used: credits.find((c) => c.typeId === t.id && c.status === "USED")?._count._all ?? 0,
      }))
      .filter((c) => c.available || c.used),
    points: stats?.points ?? 0,
    referralCode,
    referralPercent: await getSetting("referrals.discountPercent"),
  };
}

export async function getInvoice(orderId: string, userId: string | null) {
  const order = await db.order.findFirst({
    where: { id: orderId, ...(userId ? { userId } : {}), invoiceNo: { not: null } },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!order) return null;
  return {
    order,
    gst: {
      ...gstSplit(order.totalPaise, await getSetting("pricing.gstPercent")),
      percent: await getSetting("pricing.gstPercent"),
    },
  };
}

// ---------- Coupons ----------

export async function listCoupons() {
  return db.coupon.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
}

export type CouponInput = {
  code: string;
  description: string | null;
  percentOff: number | null;
  amountOffPaise: number | null;
  kinds: ProductKind[];
  maxRedemptions: number | null;
  validUntil: Date | null;
};

export async function createCoupon(input: CouponInput, actor: Actor) {
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,30}$/.test(code))
    return { ok: false as const, error: "Use 3-30 letters, numbers or hyphens." };
  if (!input.percentOff === !input.amountOffPaise)
    return { ok: false as const, error: "Give either a percentage or an amount off." };
  if (
    (await db.coupon.findUnique({ where: { code } })) ||
    (await db.referralCode.findUnique({ where: { code } }))
  ) {
    return { ok: false as const, error: "This code is already used." };
  }
  const coupon = await db.coupon.create({ data: { ...input, code } });
  await recordAudit({
    actorId: actor.id,
    action: "coupon.create",
    entityType: "coupon",
    entityId: coupon.id,
    after: { code },
  });
  return { ok: true as const };
}

export async function setCouponActive(id: string, active: boolean, actor: Actor) {
  await db.coupon.update({ where: { id }, data: { active } });
  await recordAudit({
    actorId: actor.id,
    action: active ? "coupon.activate" : "coupon.deactivate",
    entityType: "coupon",
    entityId: id,
  });
}
