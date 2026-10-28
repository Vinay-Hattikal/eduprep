// What we sell and how a price is worked out (PRD 8.13, D-040). Pure: prices come in from
// settings, so the server computes every total and the client only displays it.

export type ProductKind = "PRO" | "COMPANY_PACK" | "INTERVIEW_CREDITS";

export const PRO_PLANS = {
  monthly: { label: "Pro, 1 month", days: 30, setting: "pricing.proMonthly" },
  "half-yearly": { label: "Pro, 6 months", days: 182, setting: "pricing.proHalfYearly" },
} as const;
export type ProPlan = keyof typeof PRO_PLANS;

export const COMPANY_PACK_DAYS = 182;

export const CREDIT_BUNDLES = [1, 3, 5] as const;
export type CreditBundle = (typeof CREDIT_BUNDLES)[number];

export function isProPlan(value: string): value is ProPlan {
  return Object.hasOwn(PRO_PLANS, value);
}

export function isCreditBundle(value: number): value is CreditBundle {
  return (CREDIT_BUNDLES as readonly number[]).includes(value);
}

export type CouponTerms = {
  code: string;
  percentOff: number | null;
  amountOffPaise: number | null;
  kinds: ProductKind[];
  maxRedemptions: number | null;
  redemptions: number;
  validUntil: Date | null;
  active: boolean;
};

/** Why a coupon can't be used for this product, or null. */
export function couponProblem(coupon: CouponTerms, kind: ProductKind, now: Date): string | null {
  if (!coupon.active) return "This code is no longer active.";
  if (coupon.validUntil && coupon.validUntil < now) return "This code has expired.";
  if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions) {
    return "This code has been used up.";
  }
  if (coupon.kinds.length && !coupon.kinds.includes(kind))
    return "This code doesn't apply to this product.";
  return null;
}

export type Quote = {
  /** Unit price × quantity. */
  listPaise: number;
  bundleDiscountPaise: number;
  codeDiscountPaise: number;
  discountPaise: number;
  totalPaise: number;
};

/**
 * Bundle discount first, then one code: a coupon or a referral discount (not both; the bigger one).
 * Totals are rounded to whole rupees and never go below ₹1.
 */
export function quote(input: {
  unitPaise: number;
  quantity: number;
  bundlePercent?: number;
  coupon?: Pick<CouponTerms, "percentOff" | "amountOffPaise"> | null;
  referralPercent?: number | null;
}): Quote {
  const listPaise = input.unitPaise * input.quantity;
  const bundleDiscountPaise = roundRupee((listPaise * (input.bundlePercent ?? 0)) / 100);
  const afterBundle = listPaise - bundleDiscountPaise;
  const couponOff = input.coupon
    ? input.coupon.percentOff
      ? (afterBundle * input.coupon.percentOff) / 100
      : (input.coupon.amountOffPaise ?? 0)
    : 0;
  const referralOff = input.referralPercent ? (afterBundle * input.referralPercent) / 100 : 0;
  const codeDiscountPaise = Math.min(
    roundRupee(Math.max(couponOff, referralOff)),
    Math.max(0, afterBundle - 100),
  );
  const discountPaise = bundleDiscountPaise + codeDiscountPaise;
  return {
    listPaise,
    bundleDiscountPaise,
    codeDiscountPaise,
    discountPaise,
    totalPaise: listPaise - discountPaise,
  };
}

/** GST included in a price (PRD 8.13 GST invoices). */
export function gstSplit(totalPaise: number, gstPercent: number) {
  const taxablePaise = Math.round((totalPaise * 100) / (100 + gstPercent));
  return { taxablePaise, gstPaise: totalPaise - taxablePaise };
}

/** "INV/2026-27/000123": Indian financial year (April to March) + a gap-free number. */
export function invoiceNumber(sequence: number, paidAt: Date): string {
  const ist = new Date(paidAt.getTime() + 330 * 60_000);
  const year = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `INV/${year}-${String((year + 1) % 100).padStart(2, "0")}/${String(sequence).padStart(6, "0")}`;
}

/** Referral codes: readable, no look-alike characters. */
export function referralCodeFrom(name: string, random: () => number = Math.random): string {
  const letters = name
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 4)
    .padEnd(4, "X");
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  let suffix = "";
  for (let i = 0; i < 4; i++) suffix += alphabet[Math.floor(random() * alphabet.length)];
  return `${letters}${suffix}`;
}

function roundRupee(paise: number) {
  return Math.round(paise / 100) * 100;
}

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: paise % 100 ? 2 : 0, minimumFractionDigits: paise % 100 ? 2 : 0 })}`;
}
