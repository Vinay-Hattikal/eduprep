import { describe, expect, it } from "vitest";
import { accessFrom, coversCompany, isPro, nextPeriod } from "@/lib/commerce/access";
import {
  couponProblem,
  gstSplit,
  invoiceNumber,
  quote,
  referralCodeFrom,
  formatRupees,
} from "@/lib/commerce/pricing";
import {
  cancellationRefundsCredit,
  checkScores,
  DEFAULT_RUBRICS,
  interviewerEarning,
  needsReview,
  withinFreeChangeWindow,
} from "@/lib/interviews/policies";
import { availableSlots, checkRules } from "@/lib/interviews/slots";
import { emailHtml, renderTemplate } from "@/lib/notifications/templates";
import { addDaysLocal, parseDateKey, zonedParts, zonedToUtc } from "@/lib/time/zones";

describe("time zones", () => {
  it("converts wall-clock times to instants", () => {
    expect(
      zonedToUtc({ year: 2026, month: 10, day: 20 }, 19 * 60 + 30, "Asia/Kolkata").toISOString(),
    ).toBe("2026-10-20T14:00:00.000Z");
    // New York is on daylight time in October and standard time in December.
    expect(
      zonedToUtc({ year: 2026, month: 10, day: 20 }, 9 * 60, "America/New_York").toISOString(),
    ).toBe("2026-10-20T13:00:00.000Z");
    expect(
      zonedToUtc({ year: 2026, month: 12, day: 1 }, 9 * 60, "America/New_York").toISOString(),
    ).toBe("2026-12-01T14:00:00.000Z");
    expect(zonedParts(new Date("2026-10-20T20:00:00Z"), "Asia/Kolkata")).toMatchObject({
      day: 21,
      minute: 90,
      weekday: 3,
    });
  });

  it("handles calendar dates", () => {
    expect(addDaysLocal({ year: 2026, month: 12, day: 31 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(parseDateKey("2026-02-28")).toEqual({ year: 2026, month: 2, day: 28 });
  });
});

describe("slot engine", () => {
  // Tuesday 20 Oct 2026, 08:00 IST.
  const earliest = new Date("2026-10-20T02:30:00Z");
  const base = {
    rules: [{ weekday: 2, startMinute: 18 * 60, endMinute: 21 * 60 }],
    blockedDates: [],
    busy: [],
    timeZone: "Asia/Kolkata",
    durationMin: 60,
    bufferMin: 15,
    earliest,
    days: 1,
  };
  const ist = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);

  it("offers start times on a 30-minute grid inside the hours", () => {
    expect(availableSlots(base).map(ist)).toEqual(["18:00", "18:30", "19:00", "19:30", "20:00"]);
  });

  it("keeps a buffer around bookings and skips days off", () => {
    // Booked 18:00-19:00 IST: with a 15-minute buffer the next start is 19:30.
    const busy = [
      { start: new Date("2026-10-20T12:30:00Z"), end: new Date("2026-10-20T13:30:00Z") },
    ];
    expect(availableSlots({ ...base, busy }).map(ist)).toEqual(["19:30", "20:00"]);
  });

  it("respects notice and blocked dates", () => {
    expect(
      availableSlots({ ...base, earliest: new Date("2026-10-20T13:45:00Z") }).map(ist),
    ).toEqual(["19:30", "20:00"]);
    expect(availableSlots({ ...base, blockedDates: ["2026-10-20"] })).toEqual([]);
  });

  it("validates weekly rules", () => {
    expect(checkRules([{ weekday: 1, startMinute: 600, endMinute: 660 }])).toBeNull();
    expect(checkRules([{ weekday: 1, startMinute: 600, endMinute: 610 }])).toMatch(/at least/);
    expect(
      checkRules([
        { weekday: 1, startMinute: 600, endMinute: 720 },
        { weekday: 1, startMinute: 700, endMinute: 800 },
      ]),
    ).toMatch(/overlap/);
    expect(checkRules([{ weekday: 7, startMinute: 0, endMinute: 60 }])).toMatch(/day/);
  });
});

describe("interview policies", () => {
  const start = new Date("2026-10-21T14:00:00Z");
  it("free changes until the window; interviewer and admin cancellations always refund", () => {
    expect(withinFreeChangeWindow(start, new Date("2026-10-21T01:00:00Z"), 12)).toBe(true);
    expect(withinFreeChangeWindow(start, new Date("2026-10-21T03:00:00Z"), 12)).toBe(false);
    expect(
      cancellationRefundsCredit("candidate", start, new Date("2026-10-21T03:00:00Z"), 12),
    ).toBe(false);
    expect(
      cancellationRefundsCredit("interviewer", start, new Date("2026-10-21T13:00:00Z"), 12),
    ).toBe(true);
    expect(cancellationRefundsCredit("admin", start, new Date("2026-10-21T13:59:00Z"), 12)).toBe(
      true,
    );
  });

  it("checks scorecards against the rubric", () => {
    const rubric = DEFAULT_RUBRICS.hr!;
    const full = rubric.map((r) => ({ key: r.key, score: 3, comment: "" }));
    expect(checkScores(rubric, full)).toBeNull();
    expect(checkScores(rubric, full.slice(1))).toMatch(/Score/);
    expect(
      checkScores(rubric, [...full.slice(1), { key: rubric[0]!.key, score: 6, comment: "" }]),
    ).toMatch(/1 to 5/);
    expect(checkScores(rubric, [...full, { key: "x", score: 3, comment: "" }])).toMatch(/Unknown/);
  });

  it("earnings and quality review", () => {
    expect(interviewerEarning(69_900, 70)).toBe(48_900);
    expect(needsReview({ ratingSum: 12, ratingCount: 4, noShows: 0 }, 70)).toBe(false); // too few ratings
    expect(needsReview({ ratingSum: 16, ratingCount: 5, noShows: 0 }, 70)).toBe(true); // 3.2 stars
    expect(needsReview({ ratingSum: 20, ratingCount: 5, noShows: 0 }, 70)).toBe(false);
    expect(needsReview({ ratingSum: 25, ratingCount: 5, noShows: 2 }, 70)).toBe(true);
  });
});

describe("pricing", () => {
  it("applies bundles, then the better of coupon and referral, never below ₹1", () => {
    expect(quote({ unitPaise: 69_900, quantity: 5, bundlePercent: 15 })).toMatchObject({
      listPaise: 349_500,
      bundleDiscountPaise: 52_400,
      totalPaise: 297_100,
    });
    expect(
      quote({
        unitPaise: 29_900,
        quantity: 1,
        coupon: { percentOff: 10, amountOffPaise: null },
        referralPercent: 20,
      }).codeDiscountPaise,
    ).toBe(6_000);
    expect(
      quote({
        unitPaise: 29_900,
        quantity: 1,
        coupon: { percentOff: null, amountOffPaise: 1_00_000 },
      }).totalPaise,
    ).toBe(100);
  });

  it("checks coupons", () => {
    const coupon = {
      code: "X",
      percentOff: 10,
      amountOffPaise: null,
      kinds: ["PRO" as const],
      maxRedemptions: 2,
      redemptions: 0,
      validUntil: new Date("2026-12-31"),
      active: true,
    };
    const now = new Date("2026-10-20");
    expect(couponProblem(coupon, "PRO", now)).toBeNull();
    expect(couponProblem(coupon, "COMPANY_PACK", now)).toMatch(/doesn't apply/);
    expect(couponProblem({ ...coupon, redemptions: 2 }, "PRO", now)).toMatch(/used up/);
    expect(couponProblem(coupon, "PRO", new Date("2027-01-01"))).toMatch(/expired/);
    expect(couponProblem({ ...coupon, active: false }, "PRO", now)).toMatch(/active/);
  });

  it("splits GST and numbers invoices by Indian financial year", () => {
    expect(gstSplit(29_900, 18)).toEqual({ taxablePaise: 25_339, gstPaise: 4_561 });
    expect(invoiceNumber(42, new Date("2026-10-20T10:00:00Z"))).toBe("INV/2026-27/000042");
    expect(invoiceNumber(1, new Date("2027-03-31T19:00:00Z"))).toBe("INV/2027-28/000001"); // 1 April IST
    expect(formatRupees(149_900)).toBe("₹1,499");
    expect(referralCodeFrom("Ravi K", () => 0)).toBe("RAVI2222");
  });
});

describe("access", () => {
  const now = new Date("2026-10-20");
  const row = (o: object) => ({
    kind: "PRO" as const,
    companyId: null,
    startsAt: new Date("2026-10-01"),
    endsAt: new Date("2026-11-01"),
    revokedAt: null,
    ...o,
  });
  it("combines Pro and packs, ignoring expired or revoked rows", () => {
    const access = accessFrom(
      [
        row({}),
        row({ kind: "COMPANY_PACK", companyId: "c1" }),
        row({ kind: "COMPANY_PACK", companyId: "c2", revokedAt: now }),
        row({ endsAt: new Date("2026-10-10") }),
      ],
      now,
    );
    expect(isPro(access)).toBe(true);
    expect([...access.packs.keys()]).toEqual(["c1"]);
    const packOnly = accessFrom([row({ kind: "COMPANY_PACK", companyId: "c1" })], now);
    expect(coversCompany(packOnly, ["c1"])).toBe(true);
    expect(coversCompany(packOnly, ["c2"])).toBe(false);
    expect(coversCompany(accessFrom([], now, true), [])).toBe(true);
  });

  it("extends from the latest end date", () => {
    const period = nextPeriod([new Date("2026-11-01")], now, 30);
    expect(period.startsAt).toEqual(new Date("2026-11-01"));
    expect(period.endsAt).toEqual(new Date("2026-12-01"));
  });
});

describe("notification templates", () => {
  it("renders booking messages with the time in IST and links", () => {
    const { subject, body } = renderTemplate("booking.confirmed", {
      bookingId: "b1",
      typeName: "HR",
      startsAt: "2026-10-20T14:00:00.000Z",
      otherName: "Ira",
      meetUrl: "https://meet.example/abc",
      name: "Ravi",
      role: "candidate",
    });
    expect(subject).toContain("HR");
    expect(body).toContain("7:30");
    expect(body).toContain("https://meet.example/abc");
    expect(body).toContain("/interviews/b1");
  });

  it("escapes HTML in emails", () => {
    expect(emailHtml("<x>", "a <b> https://x.example/y")).toContain(
      '&lt;b&gt; <a href="https://x.example/y">',
    );
  });
});
