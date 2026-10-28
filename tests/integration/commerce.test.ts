// Payments end to end with the mock provider: quotes, codes, signed webhooks (the only way an
// order is paid), idempotency, entitlements, invoices, refunds, grants and the paywall.

import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { mockHeaders, mockWebhook } from "@/server/integrations/payments/mock";
import { drainJobs } from "@/server/jobs/runner";
import { getAccess } from "@/server/services/access";
import {
  createCoupon,
  createOrder,
  ensureReferralCode,
  getAccount,
  grantAccess,
  handlePaymentWebhook,
  quoteOrder,
  refundOrder,
} from "@/server/services/commerce";
import { practiceUsage } from "@/server/services/practice";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let adminId: string;
let buyer: CurrentUser;
let friend: CurrentUser;
const admin = () => ({ id: adminId, roles: ["ADMIN" as const] });

async function student(email: string): Promise<CurrentUser> {
  const user = await db.user.create({
    data: { name: email.split("@")[0]!, email, roles: ["STUDENT"], onboardedAt: new Date() },
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: ["STUDENT"],
    profileType: "FRESHER",
    onboarded: true,
  };
}

async function pay(
  orderId: string,
  overrides: Partial<{ amountPaise: number; type: "payment.captured" | "payment.failed" }> = {},
) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const { body, signature } = mockWebhook({
    type: overrides.type ?? "payment.captured",
    providerOrderId: order.providerOrderId,
    providerPaymentId: `pay_${order.id}`,
    amountPaise: overrides.amountPaise ?? order.totalPaise,
  });
  return { body, signature, outcome: await handlePaymentWebhook(body, mockHeaders(signature)) };
}

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["ADMIN"], "admin@test.example")).id;
  for (const [type, file] of [
    ["TAXONOMY", "taxonomy.csv"],
    // Companies first: question files tag questions with companies (D-054 import order).
    ["COMPANIES", "companies/companies.csv"],
    ["MCQ", "mcq/quantitative-aptitude.csv"],
    ["COMPANY_QUESTION_MAP", "companies/company-question-map.csv"],
  ] as const) {
    await importFile(type, file, await template(file), adminId);
  }
  await db.company.updateMany({ data: { status: "PUBLISHED" } });
  await db.interviewType.create({
    data: {
      slug: "hr",
      name: "HR",
      description: "d",
      audience: "BOTH",
      durationMin: 45,
      priceSetting: "interviews.hr",
      rubric: [],
    },
  });
  const mail = path.resolve(".data/test-mail");
  if (existsSync(mail)) rmSync(mail, { recursive: true });
});

beforeEach(async () => {
  for (const table of [
    "interviewCredit",
    "entitlement",
    "paymentEvent",
    "order",
    "coupon",
    "referralCode",
    "notification",
    "userStats",
  ] as const) {
    await (db[table] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await db.user.deleteMany({ where: { roles: { has: "STUDENT" } } });
  buyer = await student("buyer@test.example");
  friend = await student("friend@test.example");
});

describe("prices", () => {
  it("quotes from settings with bundle, coupon and referral discounts", async () => {
    const pro = await quoteOrder(buyer, { kind: "PRO", ref: "monthly" });
    expect(pro).toMatchObject({
      ok: true,
      quote: { totalPaise: 29_900 },
      gst: { percent: 18, gstPaise: 4_561 },
    });

    const bundle = await quoteOrder(buyer, { kind: "INTERVIEW_CREDITS", ref: "hr", quantity: 3 });
    expect(bundle).toMatchObject({
      ok: true,
      quote: { listPaise: 119_700, bundleDiscountPaise: 12_000, totalPaise: 107_700 },
    });

    await createCoupon(
      {
        code: "launch20",
        description: null,
        percentOff: 20,
        amountOffPaise: null,
        kinds: ["PRO"],
        maxRedemptions: 1,
        validUntil: null,
      },
      admin(),
    );
    expect(
      await quoteOrder(buyer, { kind: "PRO", ref: "monthly", code: "LAUNCH20" }),
    ).toMatchObject({ quote: { totalPaise: 23_900 }, code: { kind: "coupon" } });
    expect(
      await quoteOrder(buyer, { kind: "COMPANY_PACK", ref: "acme-tech", code: "LAUNCH20" }),
    ).toMatchObject({ ok: false, field: "code" });

    const code = await ensureReferralCode(friend.id, "Friend");
    expect(await quoteOrder(buyer, { kind: "PRO", ref: "monthly", code })).toMatchObject({
      quote: { totalPaise: 26_900 },
      code: { kind: "referral" },
    });
    expect(await quoteOrder(friend, { kind: "PRO", ref: "monthly", code })).toMatchObject({
      ok: false,
      error: /own referral/,
    });
    expect(await quoteOrder(buyer, { kind: "PRO", ref: "weekly" })).toMatchObject({ ok: false });
  });
});

describe("paying", () => {
  it("grants access only from a correctly signed webhook, once", async () => {
    const created = await createOrder(buyer, { kind: "PRO", ref: "monthly" });
    if (!created.ok) throw new Error(created.error);
    expect(created.checkoutPath).toBe(`/checkout/${created.orderId}`);

    const order = await db.order.findUniqueOrThrow({ where: { id: created.orderId } });
    const forged = await handlePaymentWebhook(
      JSON.stringify({
        eventId: "x",
        type: "payment.captured",
        providerOrderId: order.providerOrderId,
        providerPaymentId: "p",
        amountPaise: order.totalPaise,
      }),
      mockHeaders("00".repeat(32)),
    );
    expect(forged).toBe("invalid");
    expect((await getAccess(buyer)).proUntil).toBeNull();

    const first = await pay(created.orderId);
    expect(first.outcome).toBe("processed");
    expect(await handlePaymentWebhook(first.body, mockHeaders(first.signature))).toBe("duplicate");
    expect((await pay(created.orderId)).outcome).toBe("duplicate"); // new event, order already paid

    const paid = await db.order.findUniqueOrThrow({ where: { id: created.orderId } });
    expect(paid.status).toBe("PAID");
    expect(paid.invoiceNo).toMatch(/^INV\/\d{4}-\d{2}\/\d{6}$/);
    expect(await db.entitlement.count({ where: { userId: buyer.id } })).toBe(1);
    expect((await getAccess(buyer)).proUntil).not.toBeNull();

    // The receipt goes to the dev outbox.
    await drainJobs();
    const receipt = await db.notification.findFirstOrThrow({
      where: { userId: buyer.id, template: "purchase.receipt" },
    });
    expect(receipt.status).toBe("SENT");
    expect(readdirSync(path.resolve(".data/test-mail")).some((f) => f.includes(receipt.id))).toBe(
      true,
    );
  });

  it("rejects a wrong amount and records failures", async () => {
    const created = await createOrder(buyer, { kind: "PRO", ref: "monthly" });
    if (!created.ok) throw new Error(created.error);
    expect((await pay(created.orderId, { amountPaise: 100 })).outcome).toBe("ignored");
    expect((await db.order.findUniqueOrThrow({ where: { id: created.orderId } })).status).toBe(
      "CREATED",
    );
    await pay(created.orderId, { type: "payment.failed" });
    expect((await db.order.findUniqueOrThrow({ where: { id: created.orderId } })).status).toBe(
      "FAILED",
    );
    // Paying after a failure still works (a retry on the checkout page).
    expect((await pay(created.orderId)).outcome).toBe("processed");
  });

  it("extends Pro instead of overlapping, and gives the referrer points", async () => {
    const code = await ensureReferralCode(friend.id, "Friend");
    for (const ref of ["monthly", "monthly"]) {
      const created = await createOrder(buyer, { kind: "PRO", ref, code });
      if (!created.ok) throw new Error(created.error);
      await pay(created.orderId);
    }
    const rows = await db.entitlement.findMany({
      where: { userId: buyer.id },
      orderBy: { startsAt: "asc" },
    });
    expect(rows[1]!.startsAt.getTime()).toBe(rows[0]!.endsAt.getTime());
    expect((await db.userStats.findUniqueOrThrow({ where: { userId: friend.id } })).points).toBe(
      100,
    );
  });

  it("refunds revoke what the order bought", async () => {
    const created = await createOrder(buyer, { kind: "INTERVIEW_CREDITS", ref: "hr", quantity: 3 });
    if (!created.ok) throw new Error(created.error);
    await pay(created.orderId);
    expect((await getAccount(buyer)).credits[0]).toMatchObject({ available: 3 });
    expect(await refundOrder(created.orderId, admin(), "Changed mind")).toEqual({ ok: true });
    expect((await db.order.findUniqueOrThrow({ where: { id: created.orderId } })).status).toBe(
      "REFUNDED",
    );
    expect(
      await db.interviewCredit.count({ where: { userId: buyer.id, status: "AVAILABLE" } }),
    ).toBe(0);
    expect(await db.auditLog.count({ where: { action: "order.refund" } })).toBeGreaterThan(0);
  });
});

describe("referral codes", () => {
  it("creates one code per user, even when two requests race", async () => {
    const codes = await Promise.all([1, 2, 3].map(() => ensureReferralCode(buyer.id, "Buyer")));
    expect(new Set(codes).size).toBe(1);
    expect(await db.referralCode.count({ where: { userId: buyer.id } })).toBe(1);
  });
});

describe("paywall", () => {
  it("Pro lifts the daily practice limit; support grants are audited", async () => {
    expect((await practiceUsage(buyer)).limit).toBe(25);
    await grantAccess(buyer.id, { kind: "PRO", days: 7 }, admin(), "Goodwill");
    expect((await practiceUsage(buyer)).limit).toBeNull();
    expect(await db.auditLog.count({ where: { action: "access.grant", entityId: buyer.id } })).toBe(
      1,
    );
  });

  it("a company pack covers that company only", async () => {
    const company = await db.company.findUniqueOrThrow({ where: { slug: "acme-tech" } });
    await grantAccess(
      buyer.id,
      { kind: "COMPANY_PACK", companyId: company.id, days: 30 },
      admin(),
      "Test",
    );
    const access = await getAccess(buyer);
    expect(access.packs.has(company.id)).toBe(true);
    expect(access.proUntil).toBeNull();
    expect((await practiceUsage(buyer, undefined, access)).limit).toBe(25);
  });
});
