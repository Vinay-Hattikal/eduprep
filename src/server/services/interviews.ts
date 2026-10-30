import "server-only";

import { Prisma } from "@/generated/prisma/client";
import type { BookingStatus, Recommendation } from "@/generated/prisma/enums";
import {
  averageRating,
  cancellationRefundsCredit,
  checkScores,
  interviewerEarning,
  needsReview,
  withinFreeChangeWindow,
  type CancelBy,
  type RubricItem,
  type Score,
} from "@/lib/interviews/policies";
import {
  availableSlots,
  checkRules,
  isSlotAvailable,
  type WeeklyRule,
} from "@/lib/interviews/slots";
import { dateKey, isValidTimeZone, parseDateKey } from "@/lib/time/zones";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { getMeetingProvider } from "@/server/integrations/meetings";
import { enqueueJob } from "@/server/jobs/queue";
import { recordAudit } from "@/server/services/audit";
import { createOrder, type CreateOrderResult } from "@/server/services/commerce";
import { getInterviewType, listInterviewTypes, typePrice } from "@/server/services/interview-types";
import { notify } from "@/server/services/notifications";
import { getSetting } from "@/server/services/settings";

type Viewer = Pick<CurrentUser, "id" | "roles">;
type Actor = { id: string };

const HOUR = 3_600_000;
const MINUTE = 60_000;

/** Bookings that occupy an interviewer's time. Holds count until they expire. */
const ACTIVE: BookingStatus[] = ["HELD", "CONFIRMED", "COMPLETED"];

// ---------- Interviewer applications ----------

export type ApplicationInput = {
  headline: string;
  currentCompany: string;
  currentRole: string;
  yearsExperience: number;
  pastCompanies: string[];
  languages: string[];
  linkedinUrl: string;
  bio: string;
  typeIds: string[];
};

export async function applyAsInterviewer(user: Pick<CurrentUser, "id">, input: ApplicationInput) {
  const existing = await db.interviewer.findUnique({ where: { userId: user.id } });
  if (existing && existing.status !== "REJECTED")
    return { ok: false as const, error: "You've already applied." };
  const types = await db.interviewType.findMany({
    where: { id: { in: input.typeIds }, active: true },
    select: { id: true },
  });
  if (!types.length) return { ok: false as const, error: "Choose at least one interview type." };
  const { typeIds: _typeIds, ...data } = input;
  await db.interviewer.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data, types: { connect: types } },
    update: {
      ...data,
      status: "APPLIED",
      reviewNote: null,
      appliedAt: new Date(),
      types: { set: types },
    },
  });
  return { ok: true as const };
}

export async function getInterviewerProfile(userId: string) {
  return db.interviewer.findUnique({
    where: { userId },
    include: {
      types: { select: { id: true, name: true, slug: true } },
      rules: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
      blocks: {
        where: { date: { gte: new Date(Date.now() - 86_400_000) } },
        orderBy: { date: "asc" },
      },
    },
  });
}

export type InterviewerDecision = "approve" | "reject" | "suspend" | "reinstate" | "clear-flag";

export async function decideInterviewer(
  userId: string,
  decision: InterviewerDecision,
  actor: Actor,
  note?: string,
) {
  const interviewer = await db.interviewer.findUnique({
    where: { userId },
    include: { user: { select: { name: true, roles: true } } },
  });
  if (!interviewer) return { ok: false as const, error: "No such interviewer." };
  const allowed: Record<InterviewerDecision, string[]> = {
    approve: ["APPLIED"],
    reject: ["APPLIED"],
    suspend: ["APPROVED"],
    reinstate: ["SUSPENDED"],
    "clear-flag": ["APPROVED", "SUSPENDED"],
  };
  if (!allowed[decision].includes(interviewer.status))
    return {
      ok: false as const,
      error: `Can't ${decision} an interviewer who is ${interviewer.status.toLowerCase()}.`,
    };
  const status =
    decision === "approve" || decision === "reinstate"
      ? "APPROVED"
      : decision === "reject"
        ? "REJECTED"
        : decision === "suspend"
          ? "SUSPENDED"
          : interviewer.status;
  await db.$transaction(async (tx) => {
    await tx.interviewer.update({
      where: { userId },
      data: {
        status,
        reviewNote: note || null,
        ...(decision === "approve" && { approvedAt: new Date() }),
        ...(decision === "clear-flag" && { flaggedAt: null }),
      },
    });
    if (decision === "approve" && !interviewer.user.roles.includes("INTERVIEWER")) {
      await tx.user.update({
        where: { id: userId },
        data: { roles: [...interviewer.user.roles, "INTERVIEWER"] },
      });
    }
    await recordAudit(
      {
        actorId: actor.id,
        action: `interviewer.${decision}`,
        entityType: "interviewer",
        entityId: userId,
        before: { status: interviewer.status },
        after: { status, note },
      },
      tx,
    );
  });
  if (decision === "approve" || decision === "reject") {
    await notify(userId, "interviewer.decision", {
      name: interviewer.user.name,
      approved: decision === "approve",
      note: note ?? null,
    });
  }
  return { ok: true as const };
}

export async function listInterviewersForAdmin() {
  const rows = await db.interviewer.findMany({
    orderBy: [{ status: "asc" }, { appliedAt: "desc" }],
    include: {
      user: { select: { name: true, email: true } },
      types: { select: { name: true } },
      _count: { select: { bookings: { where: { status: "COMPLETED" } } } },
    },
  });
  return rows.map((r) => ({ ...r, rating: averageRating(r) }));
}

// ---------- Availability ----------

export async function saveAvailability(
  userId: string,
  input: { timeZone: string; bufferMin: number; rules: WeeklyRule[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!isValidTimeZone(input.timeZone)) return { ok: false, error: "Choose a valid time zone." };
  if (input.bufferMin < 0 || input.bufferMin > 120)
    return { ok: false, error: "Buffer must be 0 to 120 minutes." };
  const problem = checkRules(input.rules);
  if (problem) return { ok: false, error: problem };
  await db.$transaction([
    db.interviewer.update({
      where: { userId },
      data: { timeZone: input.timeZone, bufferMin: input.bufferMin },
    }),
    db.availabilityRule.deleteMany({ where: { interviewerId: userId } }),
    db.availabilityRule.createMany({
      data: input.rules.map((r) => ({ ...r, interviewerId: userId })),
    }),
  ]);
  return { ok: true };
}

export async function addBlockedDate(userId: string, dateKeyValue: string, note: string | null) {
  const date = parseDateKey(dateKeyValue);
  if (!date) return { ok: false as const, error: "Choose a date." };
  await db.availabilityBlock.upsert({
    where: {
      interviewerId_date: { interviewerId: userId, date: new Date(`${dateKey(date)}T00:00:00Z`) },
    },
    create: { interviewerId: userId, date: new Date(`${dateKey(date)}T00:00:00Z`), note },
    update: { note },
  });
  return { ok: true as const };
}

export async function removeBlockedDate(userId: string, blockId: string) {
  await db.availabilityBlock.deleteMany({ where: { id: blockId, interviewerId: userId } });
}

// ---------- Slots ----------

async function slotContext(
  client: Prisma.TransactionClient,
  interviewerId: string,
  now: Date,
  excludeBookingId?: string,
) {
  const interviewer = await client.interviewer.findUnique({
    where: { userId: interviewerId },
    include: {
      rules: true,
      blocks: { where: { date: { gte: new Date(now.getTime() - 2 * 86_400_000) } } },
    },
  });
  if (!interviewer) return null;
  const busy = await client.booking.findMany({
    where: {
      interviewerId,
      status: { in: ACTIVE },
      endsAt: { gt: new Date(now.getTime() - 2 * HOUR) },
      ...(excludeBookingId && { id: { not: excludeBookingId } }),
      OR: [{ status: { not: "HELD" } }, { holdExpiresAt: { gt: now } }],
    },
    select: { startsAt: true, endsAt: true },
  });
  return {
    interviewer,
    input: {
      rules: interviewer.rules,
      blockedDates: interviewer.blocks.map((b) => b.date.toISOString().slice(0, 10)),
      busy: busy.map((b) => ({ start: b.startsAt, end: b.endsAt })),
      timeZone: interviewer.timeZone,
      bufferMin: interviewer.bufferMin,
      earliest: new Date(now.getTime() + (await getSetting("interviews.minLeadHours")) * HOUR),
    },
  };
}

export async function getSlots(interviewerId: string, typeSlug: string, now = new Date()) {
  const type = await getInterviewType(typeSlug);
  const ctx = await slotContext(db, interviewerId, now);
  if (!type || !ctx || ctx.interviewer.status !== "APPROVED") return [];
  return availableSlots({ ...ctx.input, durationMin: type.durationMin });
}

/** Approved interviewers offering a type, with rating and their next free slot. */
export async function listInterviewers(
  typeSlug: string,
  filter: { company?: string } = {},
  now = new Date(),
) {
  const type = await getInterviewType(typeSlug);
  if (!type) return null;
  const rows = await db.interviewer.findMany({
    where: {
      status: "APPROVED",
      types: { some: { id: type.id } },
      ...(filter.company && {
        OR: [
          { currentCompany: { contains: filter.company, mode: "insensitive" } },
          { pastCompanies: { has: filter.company } },
        ],
      }),
    },
    include: { user: { select: { name: true } } },
  });
  const withSlots = await Promise.all(
    rows.map(async (r) => {
      const slots = await getSlots(r.userId, type.slug, now);
      return {
        id: r.userId,
        name: r.user.name,
        headline: r.headline,
        currentCompany: r.currentCompany,
        currentRole: r.currentRole,
        yearsExperience: r.yearsExperience,
        pastCompanies: r.pastCompanies,
        languages: r.languages,
        bio: r.bio,
        rating: averageRating(r),
        ratingCount: r.ratingCount,
        nextSlot: slots[0] ?? null,
        slotCount: slots.length,
      };
    }),
  );
  // Best rated with free time first; nobody with no slots is hidden, just sorted last.
  withSlots.sort(
    (a, b) => Number(!a.nextSlot) - Number(!b.nextSlot) || (b.rating ?? 0) - (a.rating ?? 0),
  );
  return { type, interviewers: withSlots };
}

// ---------- Booking ----------

/** Locks the interviewer row so two people can't book the same time (plus the DB constraint, D-039). */
async function lockInterviewer(tx: Prisma.TransactionClient, interviewerId: string) {
  await tx.$queryRaw`SELECT user_id FROM interviewers WHERE user_id = ${interviewerId} FOR UPDATE`;
  await tx.booking.updateMany({
    where: { interviewerId, status: "HELD", holdExpiresAt: { lte: new Date() } },
    data: { status: "EXPIRED" },
  });
}

export type HoldInput = {
  interviewerId: string;
  typeSlug: string;
  startsAt: Date;
  companyId?: string | null;
  notes?: string | null;
};

export type HoldResult = { ok: true; bookingId: string } | { ok: false; error: string };

/** Reserves a slot for a few minutes while the candidate pays or uses a credit. */
export async function holdSlot(
  user: Viewer,
  input: HoldInput,
  now = new Date(),
): Promise<HoldResult> {
  const type = await getInterviewType(input.typeSlug);
  if (!type?.active) return { ok: false, error: "This interview type isn't available." };
  const holdMinutes = await getSetting("interviews.holdMinutes");
  if (input.interviewerId === user.id) return { ok: false, error: "You can't book yourself." };
  try {
    const booking = await db.$transaction(async (tx) => {
      await lockInterviewer(tx, input.interviewerId);
      // One hold at a time per candidate: picking a new slot releases the old one.
      await tx.booking.updateMany({
        where: { candidateId: user.id, status: "HELD" },
        data: { status: "EXPIRED" },
      });
      const ctx = await slotContext(tx, input.interviewerId, now);
      if (!ctx || ctx.interviewer.status !== "APPROVED")
        throw new BookingError("This interviewer isn't taking bookings.");
      const offers = await tx.interviewer.count({
        where: { userId: input.interviewerId, types: { some: { id: type.id } } },
      });
      if (!offers) throw new BookingError("This interviewer doesn't offer this interview.");
      if (!isSlotAvailable({ ...ctx.input, durationMin: type.durationMin }, input.startsAt)) {
        throw new BookingError("That slot was just taken. Pick another one.");
      }
      return tx.booking.create({
        data: {
          candidateId: user.id,
          interviewerId: input.interviewerId,
          typeId: type.id,
          companyId: input.companyId || null,
          startsAt: input.startsAt,
          endsAt: new Date(input.startsAt.getTime() + type.durationMin * MINUTE),
          status: "HELD",
          holdExpiresAt: new Date(now.getTime() + holdMinutes * MINUTE),
          candidateNotes: input.notes?.trim() || null,
        },
      });
    });
    return { ok: true, bookingId: booking.id };
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, error: error.message };
    if (String(error).includes("bookings_no_overlap"))
      return { ok: false, error: "That slot was just taken. Pick another one." };
    throw error;
  }
}

class BookingError extends Error {}

/**
 * TEST_MODE only (no payments): gives the candidate a free credit for this booking's type and
 * confirms the booking with it.
 */
export async function confirmFreeForTesting(
  user: Viewer,
  bookingId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!env().TEST_MODE) return { ok: false, error: "Free booking is only available in test mode." };
  const booking = await db.booking.findFirst({
    where: { id: bookingId, candidateId: user.id },
    select: { typeId: true },
  });
  if (!booking) return { ok: false, error: "Booking not found." };
  await db.interviewCredit.create({
    data: { userId: user.id, typeId: booking.typeId, note: "TEST_MODE free booking" },
  });
  return confirmWithCredit(user, bookingId);
}

/**
 * Confirms a held booking with one of the candidate's credits. If the hold ran out, it still
 * succeeds as long as the slot is free.
 */
export async function confirmWithCredit(
  user: Viewer,
  bookingId: string,
  now = new Date(),
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, candidateId: user.id },
      });
      if (!booking) throw new BookingError("Booking not found.");
      await confirmInTx(tx, booking, now);
    });
  } catch (error) {
    if (error instanceof BookingError) return { ok: false, error: error.message };
    if (String(error).includes("bookings_no_overlap"))
      return { ok: false, error: "That slot was just taken. Pick another one." };
    throw error;
  }
  await afterConfirm(bookingId);
  return { ok: true };
}

async function confirmInTx(
  tx: Prisma.TransactionClient,
  booking: Prisma.BookingGetPayload<object>,
  now: Date,
) {
  if (booking.status === "CONFIRMED") return;
  if (booking.status !== "HELD" && booking.status !== "EXPIRED")
    throw new BookingError("This booking can't be confirmed.");
  await lockInterviewer(tx, booking.interviewerId);
  const current = await tx.booking.findUniqueOrThrow({ where: { id: booking.id } });
  if (current.status === "EXPIRED") {
    // The hold ran out: confirm only if nobody took the slot meanwhile.
    const type = await tx.interviewType.findUniqueOrThrow({ where: { id: booking.typeId } });
    const ctx = await slotContext(tx, booking.interviewerId, now, booking.id);
    const free =
      ctx &&
      isSlotAvailable(
        { ...ctx.input, durationMin: type.durationMin, earliest: now },
        booking.startsAt,
      );
    if (!free)
      throw new BookingError(
        "The slot was taken while you were paying. Your credit is saved: pick another slot.",
      );
  }
  // Two bookings of one candidate can be confirmed at once (they lock different interviewers),
  // so both writes are conditional: a credit is used once, and a booking is confirmed once.
  const confirmed = await tx.booking.updateMany({
    where: { id: booking.id, status: { in: ["HELD", "EXPIRED"] } },
    data: { status: "CONFIRMED", holdExpiresAt: null },
  });
  if (!confirmed.count) return; // confirmed by a parallel request
  for (let attempt = 0; attempt < 3; attempt++) {
    const credit = await tx.interviewCredit.findFirst({
      where: { userId: booking.candidateId, typeId: booking.typeId, status: "AVAILABLE" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!credit) break;
    const claimed = await tx.interviewCredit.updateMany({
      where: { id: credit.id, status: "AVAILABLE" },
      data: { status: "USED", bookingId: booking.id, usedAt: now },
    });
    if (claimed.count) return;
  }
  throw new BookingError("You have no credit for this interview type.");
}

/** Called by the payment webhook when an order made for a held booking is paid. */
export async function confirmPaidBooking(bookingId: string, now = new Date()) {
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return;
  try {
    await db.$transaction(async (tx) => confirmInTx(tx, booking, now));
  } catch (error) {
    // The credit stays on the account; the candidate picks another slot.
    if (error instanceof BookingError || String(error).includes("bookings_no_overlap")) return;
    throw error;
  }
  await afterConfirm(bookingId);
}

/** Pay for a held booking: an order for one credit of its type, linked to the booking. */
export async function payForBooking(
  user: Viewer,
  bookingId: string,
  code: string | null,
): Promise<CreateOrderResult> {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, candidateId: user.id, status: { in: ["HELD", "EXPIRED"] } },
  });
  if (!booking) return { ok: false, error: "This booking can't be paid for." };
  if (booking.orderId) {
    const order = await db.order.findUnique({ where: { id: booking.orderId } });
    if (order?.status === "CREATED")
      return { ok: true, orderId: order.id, checkoutPath: `/checkout/${order.id}` };
  }
  return createOrder(
    user,
    { kind: "INTERVIEW_CREDITS", ref: booking.typeId, quantity: 1, code },
    { bookingId },
  );
}

async function afterConfirm(bookingId: string) {
  await enqueueJob("booking.meeting", { bookingId, action: "create" }, { maxAttempts: 5 });
}

async function scheduleFollowUps(
  booking: { id: string; startsAt: Date; endsAt: Date },
  now = new Date(),
) {
  for (const [when, hours] of [
    ["24h", 24],
    ["1h", 1],
  ] as const) {
    const runAt = new Date(booking.startsAt.getTime() - hours * HOUR);
    if (runAt > now) {
      await enqueueJob(
        "booking.reminder",
        { bookingId: booking.id, when, startsAt: booking.startsAt.toISOString() },
        { runAt },
      );
    }
  }
  const dueHours = await getSetting("interviews.scorecardDueHours");
  await enqueueJob(
    "scorecard.overdue",
    { bookingId: booking.id, endsAt: booking.endsAt.toISOString() },
    { runAt: new Date(booking.endsAt.getTime() + dueHours * HOUR) },
  );
}

const bookingForMessages = (id: string) =>
  db.booking.findUniqueOrThrow({
    where: { id },
    include: {
      type: { select: { name: true } },
      candidate: { select: { id: true, name: true, email: true } },
      interviewer: { include: { user: { select: { id: true, name: true, email: true } } } },
      company: { select: { name: true } },
    },
  });

/** Scheduled jobs can outlive their booking (account deletion, test resets): skip, don't fail. */
function missing(error: unknown): null {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
  throw error;
}

/** Job "booking.meeting": creates, moves or cancels the calendar event, then tells both people. */
export async function syncMeeting(bookingId: string, action: "create" | "update" | "cancel") {
  const booking = await bookingForMessages(bookingId);
  const provider = getMeetingProvider();
  const input = {
    bookingId: booking.id,
    title: `${booking.type.name} mock interview: ${booking.candidate.name} with ${booking.interviewer.user.name}`,
    description: `Mock interview${booking.company ? ` for ${booking.company.name}` : ""}.${booking.candidateNotes ? `\n\nCandidate's focus: ${booking.candidateNotes}` : ""}`,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    attendees: [booking.candidate.email, booking.interviewer.user.email].filter((e): e is string =>
      Boolean(e),
    ),
  };
  const base = {
    bookingId: booking.id,
    typeName: booking.type.name,
    startsAt: booking.startsAt.toISOString(),
  };

  if (action === "cancel") {
    if (booking.meetingId) await provider.cancel(booking.meetingId);
    return;
  }
  if (booking.status !== "CONFIRMED") return;
  if (action === "create" && booking.meetUrl) return; // already done (retried job)
  const meeting =
    action === "update" && booking.meetingId
      ? await provider.update(booking.meetingId, input)
      : await provider.create(input);
  await db.booking.update({
    where: { id: booking.id },
    data: { meetingProvider: meeting.provider, meetingId: meeting.meetingId, meetUrl: meeting.url },
  });
  const template = action === "create" ? "booking.confirmed" : "booking.rescheduled";
  await notify(booking.candidate.id, template, {
    ...base,
    name: booking.candidate.name,
    role: "candidate",
    otherName: booking.interviewer.user.name,
    meetUrl: meeting.url,
  });
  await notify(booking.interviewer.user.id, template, {
    ...base,
    name: booking.interviewer.user.name,
    role: "interviewer",
    otherName: booking.candidate.name,
    meetUrl: meeting.url,
    timeZone: booking.interviewer.timeZone,
  });
  await scheduleFollowUps(booking);
}

/** Job "booking.reminder". Skipped if the booking moved or ended since it was queued. */
export async function sendReminder(bookingId: string, when: "24h" | "1h", startsAt: string) {
  const booking = await bookingForMessages(bookingId).catch(missing);
  if (!booking || booking.status !== "CONFIRMED" || booking.startsAt.toISOString() !== startsAt)
    return;
  const base = { bookingId, typeName: booking.type.name, startsAt, meetUrl: booking.meetUrl, when };
  await notify(booking.candidate.id, "booking.reminder", {
    ...base,
    name: booking.candidate.name,
    role: "candidate",
    otherName: booking.interviewer.user.name,
  });
  await notify(booking.interviewer.user.id, "booking.reminder", {
    ...base,
    name: booking.interviewer.user.name,
    role: "interviewer",
    otherName: booking.candidate.name,
    timeZone: booking.interviewer.timeZone,
  });
}

/** Job "scorecard.overdue": nudges the interviewer if the scorecard isn't in. */
export async function scorecardOverdue(bookingId: string, endsAt: string) {
  const booking = await bookingForMessages(bookingId).catch(missing);
  if (!booking || booking.status !== "CONFIRMED" || booking.endsAt.toISOString() !== endsAt) return;
  await notify(booking.interviewer.user.id, "scorecard.overdue", {
    name: booking.interviewer.user.name,
    bookingId,
    candidateName: booking.candidate.name,
    typeName: booking.type.name,
  });
}

// ---------- Changes ----------

export async function reschedule(
  user: Viewer,
  bookingId: string,
  startsAt: Date,
  now = new Date(),
) {
  const windowHours = await getSetting("interviews.rescheduleHours");
  try {
    await db.$transaction(async (tx) => {
      const booking = await tx.booking.findFirst({
        where: { id: bookingId, candidateId: user.id },
        include: { type: true },
      });
      if (!booking || booking.status !== "CONFIRMED")
        throw new BookingError("Only confirmed bookings can be moved.");
      if (!withinFreeChangeWindow(booking.startsAt, now, windowHours)) {
        throw new BookingError(
          `Bookings can be moved up to ${windowHours} hours before the start.`,
        );
      }
      await lockInterviewer(tx, booking.interviewerId);
      const ctx = await slotContext(tx, booking.interviewerId, now, booking.id);
      if (
        !ctx ||
        !isSlotAvailable({ ...ctx.input, durationMin: booking.type.durationMin }, startsAt)
      ) {
        throw new BookingError("That slot isn't available. Pick another one.");
      }
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          startsAt,
          endsAt: new Date(startsAt.getTime() + booking.type.durationMin * MINUTE),
          rescheduleCount: { increment: 1 },
        },
      });
    });
  } catch (error) {
    if (error instanceof BookingError) return { ok: false as const, error: error.message };
    if (String(error).includes("bookings_no_overlap"))
      return { ok: false as const, error: "That slot was just taken. Pick another one." };
    throw error;
  }
  await enqueueJob("booking.meeting", { bookingId, action: "update" }, { maxAttempts: 5 });
  return { ok: true as const };
}

export async function cancelBooking(
  bookingId: string,
  by: CancelBy,
  actorId: string,
  reason: string,
  now = new Date(),
) {
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking) return { ok: false as const, error: "Booking not found." };
  if (by === "candidate" && booking.candidateId !== actorId)
    return { ok: false as const, error: "Booking not found." };
  if (by === "interviewer" && booking.interviewerId !== actorId)
    return { ok: false as const, error: "Booking not found." };
  if (booking.status === "HELD" || booking.status === "EXPIRED") {
    if (by !== "candidate") return { ok: false as const, error: "Nothing to cancel." };
    await db.booking.update({
      where: { id: bookingId },
      data: { status: "EXPIRED", holdExpiresAt: null },
    });
    return { ok: true as const, creditReturned: false };
  }
  if (booking.status !== "CONFIRMED")
    return { ok: false as const, error: "This booking can't be cancelled." };
  if (by === "interviewer" && booking.startsAt.getTime() - now.getTime() < 24 * HOUR) {
    return { ok: false as const, error: "Less than 24 hours to go: contact support to cancel." };
  }
  const windowHours = await getSetting("interviews.rescheduleHours");
  const refund = cancellationRefundsCredit(by, booking.startsAt, now, windowHours);
  await db.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED", cancelledAt: now, cancelledById: actorId, cancelReason: reason },
    });
    if (refund) {
      await tx.interviewCredit.updateMany({
        where: { bookingId },
        data: { status: "AVAILABLE", bookingId: null, usedAt: null },
      });
    }
    if (by === "admin")
      await recordAudit(
        {
          actorId,
          action: "booking.cancel",
          entityType: "booking",
          entityId: bookingId,
          after: { reason, creditReturned: refund },
        },
        tx,
      );
  });
  await enqueueJob("booking.meeting", { bookingId, action: "cancel" }, { maxAttempts: 5 });
  await notifyCancelled(bookingId, refund, reason);
  return { ok: true as const, creditReturned: refund };
}

async function notifyCancelled(bookingId: string, creditReturned: boolean, reason: string) {
  const b = await bookingForMessages(bookingId);
  const base = {
    bookingId,
    typeName: b.type.name,
    startsAt: b.startsAt.toISOString(),
    meetUrl: null,
    creditReturned,
    reason,
  };
  await notify(b.candidate.id, "booking.cancelled", {
    ...base,
    name: b.candidate.name,
    role: "candidate",
    otherName: b.interviewer.user.name,
  });
  await notify(b.interviewer.user.id, "booking.cancelled", {
    ...base,
    name: b.interviewer.user.name,
    role: "interviewer",
    otherName: b.candidate.name,
    timeZone: b.interviewer.timeZone,
  });
}

/** Ops: the interviewer didn't show up. The candidate gets the credit back; the interviewer a penalty. */
export async function markInterviewerNoShow(
  bookingId: string,
  actor: Actor,
  note: string,
  now = new Date(),
) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { type: true },
  });
  if (!booking || !["CONFIRMED", "NO_SHOW_CANDIDATE"].includes(booking.status))
    return { ok: false as const, error: "This booking can't be marked." };
  if (booking.startsAt > now)
    return { ok: false as const, error: "The interview hasn't started yet." };
  const [share, penaltyPercent, threshold] = await Promise.all([
    getSetting("payouts.interviewerSharePercent"),
    getSetting("interviews.noShowPenaltyPercent"),
    getSetting("interviews.reviewBelowRatingPercent"),
  ]);
  const earning = interviewerEarning(await typePrice(booking.type.priceSetting), share);
  await db.$transaction(async (tx) => {
    await tx.booking.update({ where: { id: bookingId }, data: { status: "NO_SHOW_INTERVIEWER" } });
    await tx.interviewCredit.updateMany({
      where: { bookingId },
      data: { status: "AVAILABLE", bookingId: null, usedAt: null },
    });
    // Undo an earning recorded for a wrongly marked candidate no-show, then apply the penalty.
    await tx.payoutEntry.deleteMany({ where: { bookingId, kind: "EARNING", payoutId: null } });
    await tx.payoutEntry.create({
      data: {
        interviewerId: booking.interviewerId,
        bookingId,
        kind: "PENALTY",
        amountPaise: -Math.round((earning * penaltyPercent) / 100),
        note,
      },
    });
    const interviewer = await tx.interviewer.update({
      where: { userId: booking.interviewerId },
      data: { noShows: { increment: 1 } },
    });
    if (needsReview(interviewer, threshold) && !interviewer.flaggedAt) {
      await tx.interviewer.update({
        where: { userId: booking.interviewerId },
        data: { flaggedAt: now },
      });
    }
    await recordAudit(
      {
        actorId: actor.id,
        action: "booking.interviewer_no_show",
        entityType: "booking",
        entityId: bookingId,
        after: { note },
      },
      tx,
    );
  });
  await notifyCancelled(bookingId, true, "the interviewer couldn't attend");
  return { ok: true as const };
}

/** Interviewer: the candidate didn't join. No refund (PRD 8.7); the interviewer is paid. */
export async function markCandidateNoShow(userId: string, bookingId: string, now = new Date()) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, interviewerId: userId },
    include: { type: true },
  });
  if (!booking || booking.status !== "CONFIRMED")
    return { ok: false as const, error: "This booking can't be marked." };
  if (booking.startsAt.getTime() + 10 * MINUTE > now.getTime()) {
    return {
      ok: false as const,
      error: "Wait at least 10 minutes after the start before marking a no-show.",
    };
  }
  const earning = interviewerEarning(
    await typePrice(booking.type.priceSetting),
    await getSetting("payouts.interviewerSharePercent"),
  );
  await db.$transaction([
    db.booking.update({ where: { id: bookingId }, data: { status: "NO_SHOW_CANDIDATE" } }),
    db.payoutEntry.create({
      data: {
        interviewerId: userId,
        bookingId,
        kind: "EARNING",
        amountPaise: earning,
        note: "Candidate didn't join",
      },
    }),
  ]);
  return { ok: true as const };
}

// ---------- Scorecards and ratings ----------

export type ScorecardInput = {
  scores: Score[];
  strengths: string;
  improvements: string;
  recommendation: Recommendation;
  recommendedTopics: string[];
};

export async function submitScorecard(
  userId: string,
  bookingId: string,
  input: ScorecardInput,
  now = new Date(),
) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, interviewerId: userId },
    include: { type: true, scorecard: true },
  });
  if (!booking) return { ok: false as const, error: "Booking not found." };
  if (booking.scorecard)
    return { ok: false as const, error: "The scorecard is already submitted." };
  if (booking.status !== "CONFIRMED")
    return { ok: false as const, error: "This booking isn't waiting for a scorecard." };
  if (booking.startsAt > now)
    return {
      ok: false as const,
      error: "You can submit the scorecard once the interview has started.",
    };
  const problem = checkScores(booking.type.rubric as RubricItem[], input.scores);
  if (problem) return { ok: false as const, error: problem };
  if (input.strengths.trim().length < 20 || input.improvements.trim().length < 20) {
    return {
      ok: false as const,
      error: "Write at least a couple of sentences for strengths and areas to improve.",
    };
  }
  const topics = await db.topic.findMany({
    where: { slug: { in: input.recommendedTopics } },
    select: { slug: true },
  });
  const earning = interviewerEarning(
    await typePrice(booking.type.priceSetting),
    await getSetting("payouts.interviewerSharePercent"),
  );
  await db.$transaction(async (tx) => {
    await tx.scorecard.create({
      data: {
        bookingId,
        scores: input.scores,
        strengths: input.strengths.trim(),
        improvements: input.improvements.trim(),
        recommendation: input.recommendation,
        recommendedTopics: topics.map((t) => t.slug),
        submittedAt: now,
      },
    });
    await tx.booking.update({ where: { id: bookingId }, data: { status: "COMPLETED" } });
    // Earnings are released once the scorecard is in (PRD 8.7).
    await tx.payoutEntry.create({
      data: { interviewerId: userId, bookingId, kind: "EARNING", amountPaise: earning },
    });
  });
  const b = await bookingForMessages(bookingId);
  await notify(b.candidate.id, "scorecard.ready", {
    name: b.candidate.name,
    bookingId,
    typeName: b.type.name,
    interviewerName: b.interviewer.user.name,
  });
  return { ok: true as const };
}

export async function rateInterviewer(
  user: Viewer,
  bookingId: string,
  stars: number,
  comment: string | null,
  now = new Date(),
) {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5)
    return { ok: false as const, error: "Choose 1 to 5 stars." };
  const booking = await db.booking.findFirst({
    where: { id: bookingId, candidateId: user.id },
    include: { rating: true },
  });
  if (!booking || booking.status !== "COMPLETED")
    return { ok: false as const, error: "You can rate after the scorecard arrives." };
  if (booking.rating) return { ok: false as const, error: "You've already rated this interview." };
  const threshold = await getSetting("interviews.reviewBelowRatingPercent");
  await db.$transaction(async (tx) => {
    await tx.interviewerRating.create({
      data: { bookingId, stars, comment: comment?.trim() || null },
    });
    const interviewer = await tx.interviewer.update({
      where: { userId: booking.interviewerId },
      data: { ratingSum: { increment: stars }, ratingCount: { increment: 1 } },
    });
    if (needsReview(interviewer, threshold) && !interviewer.flaggedAt) {
      await tx.interviewer.update({
        where: { userId: booking.interviewerId },
        data: { flaggedAt: now },
      });
    }
  });
  return { ok: true as const };
}

// ---------- Views ----------

const bookingInclude = {
  type: { select: { name: true, slug: true, durationMin: true, rubric: true } },
  company: { select: { name: true, slug: true } },
  interviewer: {
    select: {
      userId: true,
      headline: true,
      currentCompany: true,
      timeZone: true,
      user: { select: { name: true } },
    },
  },
  candidate: { select: { id: true, name: true } },
  scorecard: true,
  rating: true,
} satisfies Prisma.BookingInclude;

export async function listCandidateBookings(userId: string) {
  return db.booking.findMany({
    where: { candidateId: userId, status: { not: "EXPIRED" } },
    orderBy: { startsAt: "desc" },
    include: bookingInclude,
  });
}

export async function getCandidateBooking(userId: string, bookingId: string) {
  return db.booking.findFirst({
    where: { id: bookingId, candidateId: userId },
    include: { ...bookingInclude, order: true },
  });
}

export async function availableCredits(userId: string) {
  const rows = await db.interviewCredit.groupBy({
    by: ["typeId"],
    where: { userId, status: "AVAILABLE" },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.typeId, r._count._all]));
}

export async function interviewHub(userId: string) {
  const [types, credits, bookings] = await Promise.all([
    listInterviewTypes(),
    availableCredits(userId),
    listCandidateBookings(userId),
  ]);
  const now = Date.now();
  return {
    types: types.map((t) => ({ ...t, credits: credits.get(t.id) ?? 0 })),
    upcoming: bookings
      .filter((b) => b.status === "CONFIRMED" && b.endsAt.getTime() > now - 2 * HOUR)
      .reverse(),
    held: bookings.filter((b) => b.status === "HELD"),
    past: bookings.filter(
      (b) =>
        !(b.status === "CONFIRMED" && b.endsAt.getTime() > now - 2 * HOUR) && b.status !== "HELD",
    ),
  };
}

export async function interviewerDashboard(userId: string, now = new Date()) {
  const [profile, upcoming, due, ledger] = await Promise.all([
    db.interviewer.findUnique({ where: { userId } }),
    db.booking.findMany({
      where: { interviewerId: userId, status: "CONFIRMED", startsAt: { gt: now } },
      orderBy: { startsAt: "asc" },
      include: bookingInclude,
    }),
    db.booking.findMany({
      where: { interviewerId: userId, status: "CONFIRMED", startsAt: { lte: now } },
      orderBy: { startsAt: "asc" },
      include: bookingInclude,
    }),
    db.payoutEntry.findMany({ where: { interviewerId: userId } }),
  ]);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    profile,
    rating: profile ? averageRating(profile) : null,
    upcoming,
    due,
    balancePaise: ledger.reduce((n, e) => n + e.amountPaise, 0),
    monthPaise: ledger
      .filter((e) => e.kind === "EARNING" && e.createdAt >= monthStart)
      .reduce((n, e) => n + e.amountPaise, 0),
  };
}

/** What the interviewer sees about the candidate before and during the interview. */
export async function getInterviewerBooking(userId: string, bookingId: string) {
  const booking = await db.booking.findFirst({
    where: { id: bookingId, interviewerId: userId },
    include: bookingInclude,
  });
  if (!booking) return null;
  const [candidate, mastery, stats] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: booking.candidateId },
      select: {
        name: true,
        profileType: true,
        preferredLanguage: true,
        fresherProfile: true,
        experiencedProfile: true,
        targetCompanies: { select: { company: { select: { name: true } }, targetDate: true } },
      },
    }),
    db.mastery.findMany({
      where: { userId: booking.candidateId, attempts: { gte: 3 } },
      orderBy: { score: "asc" },
      take: 5,
      include: { topic: { select: { name: true } } },
    }),
    db.userStats.findUnique({ where: { userId: booking.candidateId } }),
  ]);
  return {
    booking,
    candidate,
    weakTopics: mastery.map((m) => ({ name: m.topic.name, score: m.score })),
    stats,
  };
}

export async function interviewerEarnings(userId: string) {
  const [entries, payouts] = await Promise.all([
    db.payoutEntry.findMany({
      where: { interviewerId: userId },
      orderBy: { createdAt: "desc" },
      include: {
        booking: {
          select: {
            startsAt: true,
            type: { select: { name: true } },
            candidate: { select: { name: true } },
          },
        },
      },
    }),
    db.payout.findMany({ where: { interviewerId: userId }, orderBy: { createdAt: "desc" } }),
  ]);
  return { entries, payouts, balancePaise: entries.reduce((n, e) => n + e.amountPaise, 0) };
}

export async function listInterviewerBookings(userId: string) {
  return db.booking.findMany({
    where: { interviewerId: userId, status: { notIn: ["HELD", "EXPIRED"] } },
    orderBy: { startsAt: "desc" },
    take: 100,
    include: bookingInclude,
  });
}

// ---------- Admin ----------

export async function listBookingsForAdmin(filter: { status?: BookingStatus; q?: string }) {
  return db.booking.findMany({
    where: {
      status: filter.status ?? { notIn: ["HELD", "EXPIRED"] },
      ...(filter.q && {
        OR: [
          { candidate: { name: { contains: filter.q, mode: "insensitive" } } },
          { interviewer: { user: { name: { contains: filter.q, mode: "insensitive" } } } },
        ],
      }),
    },
    orderBy: { startsAt: "desc" },
    take: 200,
    include: bookingInclude,
  });
}

export async function payoutBalances() {
  const [sums, interviewers] = await Promise.all([
    db.payoutEntry.groupBy({ by: ["interviewerId"], _sum: { amountPaise: true } }),
    db.interviewer.findMany({
      select: { userId: true, user: { select: { name: true, email: true } } },
    }),
  ]);
  return interviewers
    .map((i) => ({
      ...i,
      balancePaise: sums.find((s) => s.interviewerId === i.userId)?._sum.amountPaise ?? 0,
    }))
    .filter((i) => i.balancePaise !== 0)
    .sort((a, b) => b.balancePaise - a.balancePaise);
}

/** Records money sent to an interviewer (bank transfer now; Razorpay Route in Phase 6). */
export async function recordPayout(
  interviewerId: string,
  amountPaise: number,
  reference: string,
  actor: Actor,
) {
  const balance =
    (await db.payoutEntry.aggregate({ where: { interviewerId }, _sum: { amountPaise: true } }))._sum
      .amountPaise ?? 0;
  if (amountPaise <= 0 || amountPaise > balance)
    return {
      ok: false as const,
      error: "The amount must be more than zero and at most the balance.",
    };
  await db.$transaction(async (tx) => {
    const payout = await tx.payout.create({
      data: { interviewerId, amountPaise, reference, createdById: actor.id },
    });
    await tx.payoutEntry.create({
      data: {
        interviewerId,
        payoutId: payout.id,
        kind: "PAYOUT",
        amountPaise: -amountPaise,
        note: reference,
      },
    });
    await recordAudit(
      {
        actorId: actor.id,
        action: "payout.record",
        entityType: "interviewer",
        entityId: interviewerId,
        after: { amountPaise, reference },
      },
      tx,
    );
  });
  return { ok: true as const };
}
