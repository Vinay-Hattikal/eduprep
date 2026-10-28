// Mock interviews end to end (Phase 5 exit criteria): apply and approve an interviewer, set
// hours, buy a credit, hold and confirm a slot (no double booking), meeting link and messages,
// reschedule and cancel rules, scorecard → earnings → candidate, rating, no-shows, payouts.

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RUBRICS } from "@/lib/interviews/policies";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { mockWebhook } from "@/server/integrations/payments/mock";
import { drainJobs } from "@/server/jobs/runner";
import { createOrder, handlePaymentWebhook } from "@/server/services/commerce";
import {
  applyAsInterviewer,
  cancelBooking,
  confirmWithCredit,
  decideInterviewer,
  getSlots,
  holdSlot,
  interviewerDashboard,
  listInterviewers,
  markCandidateNoShow,
  markInterviewerNoShow,
  payForBooking,
  payoutBalances,
  rateInterviewer,
  recordPayout,
  reschedule,
  saveAvailability,
  submitScorecard,
} from "@/server/services/interviews";
import { createUser, resetDatabase } from "./helpers";

let adminId: string;
let candidate: CurrentUser;
let other: CurrentUser;
let interviewerId: string;
const admin = () => ({ id: adminId, roles: ["SUPER_ADMIN" as const] });

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

async function payOrder(orderId: string) {
  const order = await db.order.findUniqueOrThrow({ where: { id: orderId } });
  const { body, headers } = mockWebhook({
    type: "payment.captured",
    providerOrderId: order.providerOrderId,
    providerPaymentId: `pay_${order.id}`,
    amountPaise: order.totalPaise,
  });
  return handlePaymentWebhook(body, headers);
}

async function buyCredit(user: CurrentUser) {
  const created = await createOrder(user, {
    kind: "INTERVIEW_CREDITS",
    ref: "technical-fresher",
    quantity: 1,
  });
  if (!created.ok) throw new Error(created.error);
  await payOrder(created.orderId);
}

/** A confirmed booking in free slot `index`, counting from a day ahead (outside the 12 h window). */
async function book(user: CurrentUser, index = 0) {
  const slots = (await getSlots(interviewerId, "technical-fresher")).filter(
    (s) => s.getTime() > Date.now() + 24 * 3_600_000,
  );
  const hold = await holdSlot(user, {
    interviewerId,
    typeSlug: "technical-fresher",
    startsAt: slots[index]!,
  });
  if (!hold.ok) throw new Error(hold.error);
  await buyCredit(user);
  const confirmed = await confirmWithCredit(user, hold.bookingId);
  if (!confirmed.ok) throw new Error(confirmed.error);
  await drainJobs();
  return db.booking.findUniqueOrThrow({ where: { id: hold.bookingId } });
}

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["SUPER_ADMIN"], "admin@test.example")).id;
  await db.topic.create({
    data: { slug: "arrays", name: "Arrays", subject: { create: { slug: "dsa", name: "DSA" } } },
  });
  await db.interviewType.create({
    data: {
      slug: "technical-fresher",
      name: "Technical (fresher)",
      description: "d",
      audience: "FRESHER",
      durationMin: 60,
      priceSetting: "interviews.technicalFresher",
      rubric: DEFAULT_RUBRICS["technical-fresher"]!,
    },
  });

  // Apply, approve, set hours: every day 09:00-21:00 IST.
  const user = await db.user.create({
    data: { name: "Ira Interviewer", email: "ira@test.example", roles: ["STUDENT"] },
  });
  interviewerId = user.id;
  const type = await db.interviewType.findUniqueOrThrow({ where: { slug: "technical-fresher" } });
  expect(
    await applyAsInterviewer(user, {
      headline: "SDE-2",
      currentCompany: "Example Co",
      currentRole: "SDE-2",
      yearsExperience: 5,
      pastCompanies: [],
      languages: ["English"],
      linkedinUrl: "https://linkedin.com/in/x",
      bio: "Bio",
      typeIds: [type.id],
    }),
  ).toEqual({ ok: true });
  expect(await decideInterviewer(user.id, "approve", admin())).toEqual({ ok: true });
  expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).roles).toContain(
    "INTERVIEWER",
  );
  expect(
    await saveAvailability(user.id, {
      timeZone: "Asia/Kolkata",
      bufferMin: 15,
      rules: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startMinute: 9 * 60,
        endMinute: 21 * 60,
      })),
    }),
  ).toEqual({ ok: true });
});

beforeEach(async () => {
  for (const table of [
    "payoutEntry",
    "payout",
    "interviewerRating",
    "scorecard",
    "interviewCredit",
    "booking",
    "paymentEvent",
    "order",
    "notification",
    "job",
  ] as const) {
    await (db[table] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  await db.interviewer.update({
    where: { userId: interviewerId },
    data: { ratingSum: 0, ratingCount: 0, noShows: 0, flaggedAt: null },
  });
  await db.user.deleteMany({
    where: { email: { in: ["cand@test.example", "other@test.example"] } },
  });
  candidate = await student("cand@test.example");
  other = await student("other@test.example");
});

describe("finding a slot", () => {
  it("lists the interviewer with free slots after the minimum notice", async () => {
    const list = await listInterviewers("technical-fresher");
    expect(list?.interviewers).toHaveLength(1);
    expect(list?.interviewers[0]).toMatchObject({ name: "Ira Interviewer", rating: null });
    const slots = await getSlots(interviewerId, "technical-fresher");
    expect(slots.length).toBeGreaterThan(50);
    expect(slots[0]!.getTime()).toBeGreaterThanOrEqual(Date.now() + 6 * 3_600_000 - 1000);
  });

  it("never gives one slot to two candidates", async () => {
    const [slot] = await getSlots(interviewerId, "technical-fresher");
    const results = await Promise.all([
      holdSlot(candidate, { interviewerId, typeSlug: "technical-fresher", startsAt: slot! }),
      holdSlot(other, { interviewerId, typeSlug: "technical-fresher", startsAt: slot! }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toMatchObject({ error: /just taken/ });
    // The held slot (and its buffer) is gone for everyone else.
    const after = await getSlots(interviewerId, "technical-fresher");
    expect(after.some((s) => s.getTime() === slot!.getTime())).toBe(false);
  });
});

describe("booking", () => {
  it("pays for a held slot, confirms it, creates the meeting and tells both people", async () => {
    const [slot] = await getSlots(interviewerId, "technical-fresher");
    const hold = await holdSlot(candidate, {
      interviewerId,
      typeSlug: "technical-fresher",
      startsAt: slot!,
    });
    if (!hold.ok) throw new Error(hold.error);
    expect(await confirmWithCredit(candidate, hold.bookingId)).toMatchObject({
      ok: false,
      error: /no credit/,
    });

    const order = await payForBooking(candidate, hold.bookingId, null);
    if (!order.ok) throw new Error(order.error);
    expect(await payOrder(order.orderId)).toBe("processed");
    await drainJobs();

    const booking = await db.booking.findUniqueOrThrow({
      where: { id: hold.bookingId },
      include: { credit: true },
    });
    expect(booking).toMatchObject({ status: "CONFIRMED", meetingProvider: "mock" });
    expect(booking.meetUrl).toContain(`/meet/${booking.id}`);
    expect(booking.credit?.status).toBe("USED");

    const messages = await db.notification.findMany({ where: { template: "booking.confirmed" } });
    expect(messages.map((m) => m.userId).sort()).toEqual([candidate.id, interviewerId].sort());
    expect(messages.every((m) => m.status === "SENT" && m.body.includes(booking.meetUrl!))).toBe(
      true,
    );
    const reminders = await db.job.findMany({ where: { type: "booking.reminder" } });
    expect(reminders.length).toBeGreaterThanOrEqual(1);
    expect(await db.job.count({ where: { type: "scorecard.overdue" } })).toBe(1);

    const dashboard = await interviewerDashboard(interviewerId);
    expect(dashboard.upcoming.map((b) => b.id)).toEqual([booking.id]);
  });

  it("moves a booking inside the window and keeps the meeting", async () => {
    const booking = await book(candidate);
    const slots = await getSlots(interviewerId, "technical-fresher");
    const later = slots.find((s) => s.getTime() > booking.startsAt.getTime() + 3 * 3_600_000)!;
    expect(await reschedule(candidate, booking.id, later)).toEqual({ ok: true });
    await drainJobs();
    const moved = await db.booking.findUniqueOrThrow({ where: { id: booking.id } });
    expect(moved.startsAt).toEqual(later);
    expect(moved.rescheduleCount).toBe(1);
    expect(await db.notification.count({ where: { template: "booking.rescheduled" } })).toBe(2);
    // Too close to the start: no moving.
    const soon = new Date(booking.startsAt.getTime() - 3_600_000);
    expect(await reschedule(candidate, booking.id, later, soon)).toMatchObject({
      ok: false,
      error: /12 hours/,
    });
  });

  it("returns the credit for early cancellations, not late ones", async () => {
    const early = await book(candidate, 0);
    expect(await cancelBooking(early.id, "candidate", candidate.id, "Exam clash")).toEqual({
      ok: true,
      creditReturned: true,
    });
    expect(
      await db.interviewCredit.count({ where: { userId: candidate.id, status: "AVAILABLE" } }),
    ).toBe(1);

    const late = await book(other, 4);
    const nearStart = new Date(late.startsAt.getTime() - 2 * 3_600_000);
    expect(await cancelBooking(late.id, "candidate", other.id, "Busy", nearStart)).toEqual({
      ok: true,
      creditReturned: false,
    });
    expect(
      await db.interviewCredit.count({ where: { userId: other.id, status: "AVAILABLE" } }),
    ).toBe(0);
  });
});

describe("after the interview", () => {
  const scorecard = {
    scores: DEFAULT_RUBRICS["technical-fresher"]!.map((r) => ({
      key: r.key,
      score: 4,
      comment: "Good",
    })),
    strengths: "Clear thinking and clean code throughout the session.",
    improvements: "Practise edge cases and explain complexity before coding.",
    recommendation: "BORDERLINE" as const,
    recommendedTopics: ["arrays", "not-a-topic"],
  };

  it("scorecard → candidate sees it → interviewer earns → rating → payout", async () => {
    const booking = await book(candidate);
    const during = new Date(booking.startsAt.getTime() + 30 * 60_000);
    expect(await submitScorecard(interviewerId, booking.id, scorecard)).toMatchObject({
      ok: false,
      error: /started/,
    });
    expect(
      await submitScorecard(
        interviewerId,
        booking.id,
        { ...scorecard, scores: scorecard.scores.slice(1) },
        during,
      ),
    ).toMatchObject({ ok: false });
    expect(await submitScorecard(interviewerId, booking.id, scorecard, during)).toEqual({
      ok: true,
    });
    await drainJobs();

    const done = await db.booking.findUniqueOrThrow({
      where: { id: booking.id },
      include: { scorecard: true },
    });
    expect(done.status).toBe("COMPLETED");
    expect(done.scorecard?.recommendedTopics).toEqual(["arrays"]);
    expect(
      await db.notification.count({
        where: { userId: candidate.id, template: "scorecard.ready", status: "SENT" },
      }),
    ).toBe(1);

    // 70% of ₹699, rounded down to the rupee.
    const [balance] = await payoutBalances();
    expect(balance).toMatchObject({ userId: interviewerId, balancePaise: 48_900 });

    expect(await rateInterviewer(candidate, booking.id, 5, "Very helpful")).toEqual({ ok: true });
    expect(await rateInterviewer(candidate, booking.id, 4, null)).toMatchObject({ ok: false });
    expect(await recordPayout(interviewerId, 60_000, "UTR1", admin())).toMatchObject({ ok: false });
    expect(await recordPayout(interviewerId, 48_900, "UTR1", admin())).toEqual({ ok: true });
    expect(await payoutBalances()).toEqual([]);
  });

  it("an interviewer no-show refunds the candidate and penalises the interviewer", async () => {
    const booking = await book(candidate);
    const after = new Date(booking.startsAt.getTime() + 20 * 60_000);
    expect(
      await markCandidateNoShow(
        interviewerId,
        booking.id,
        new Date(booking.startsAt.getTime() + 60_000),
      ),
    ).toMatchObject({ ok: false });
    expect(await markCandidateNoShow(interviewerId, booking.id, after)).toEqual({ ok: true });
    // Candidate disputes; ops finds the interviewer never joined.
    expect(await markInterviewerNoShow(booking.id, admin(), "Never joined", after)).toEqual({
      ok: true,
    });
    expect(
      await db.interviewCredit.count({ where: { userId: candidate.id, status: "AVAILABLE" } }),
    ).toBe(1);
    const entries = await db.payoutEntry.findMany({ where: { bookingId: booking.id } });
    expect(entries.map((e) => [e.kind, e.amountPaise])).toEqual([["PENALTY", -24_450]]);
    expect(
      (await db.interviewer.findUniqueOrThrow({ where: { userId: interviewerId } })).noShows,
    ).toBe(1);
  });
});
