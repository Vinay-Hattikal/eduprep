"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import {
  cancelBooking,
  confirmFreeForTesting,
  confirmWithCredit,
  holdSlot,
  payForBooking,
  rateInterviewer,
  reschedule,
} from "@/server/services/interviews";

export type FormState = { error?: string };

const id = z.string().min(1).max(40);
const isoDate = z.string().datetime();

export async function holdAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("student.access");
  const parsed = z
    .object({
      interviewerId: id,
      typeSlug: z.string().max(60),
      startsAt: isoDate,
      companyId: z.string().max(40).optional(),
      notes: z.string().max(1000).optional(),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Pick a time." };
  const result = await holdSlot(user, { ...parsed.data, startsAt: new Date(parsed.data.startsAt) });
  if (!result.ok) return { error: result.error };
  redirect(`/interviews/checkout/${result.bookingId}`);
}

export async function useCreditAction(formData: FormData) {
  const user = await requirePermission("student.access");
  const bookingId = id.parse(formData.get("bookingId"));
  const result = await confirmWithCredit(user, bookingId);
  revalidatePath("/interviews");
  if (!result.ok)
    redirect(`/interviews/checkout/${bookingId}?error=${encodeURIComponent(result.error)}`);
  redirect(`/interviews/${bookingId}?booked=1`);
}

/** TEST_MODE only: confirm without paying. */
export async function bookFreeAction(formData: FormData) {
  const user = await requirePermission("student.access");
  const bookingId = id.parse(formData.get("bookingId"));
  const result = await confirmFreeForTesting(user, bookingId);
  revalidatePath("/interviews");
  if (!result.ok)
    redirect(`/interviews/checkout/${bookingId}?error=${encodeURIComponent(result.error)}`);
  redirect(`/interviews/${bookingId}?booked=1`);
}

export async function payBookingAction(formData: FormData) {
  const user = await requirePermission("student.access");
  const bookingId = id.parse(formData.get("bookingId"));
  const code = z
    .string()
    .max(40)
    .parse(formData.get("code") ?? "")
    .trim();
  const result = await payForBooking(user, bookingId, code || null);
  if (!result.ok)
    redirect(`/interviews/checkout/${bookingId}?error=${encodeURIComponent(result.error)}`);
  redirect(result.checkoutPath);
}

export async function rescheduleAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("student.access");
  const bookingId = id.parse(formData.get("bookingId"));
  const startsAt = isoDate.safeParse(formData.get("startsAt"));
  if (!startsAt.success) return { error: "Pick a new time." };
  const result = await reschedule(user, bookingId, new Date(startsAt.data));
  if (!result.ok) return { error: result.error };
  revalidatePath("/interviews");
  redirect(`/interviews/${bookingId}?moved=1`);
}

export async function cancelAction(formData: FormData) {
  const user = await requirePermission("student.access");
  const bookingId = id.parse(formData.get("bookingId"));
  const result = await cancelBooking(
    bookingId,
    "candidate",
    user.id,
    String(formData.get("reason") ?? "").slice(0, 200) || "cancelled by the candidate",
  );
  revalidatePath("/interviews");
  if (!result.ok) redirect(`/interviews/${bookingId}?error=${encodeURIComponent(result.error)}`);
  redirect(`/interviews/${bookingId}?cancelled=${result.creditReturned ? "credit" : "late"}`);
}

export async function rateAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requirePermission("student.access");
  const bookingId = id.parse(formData.get("bookingId"));
  const result = await rateInterviewer(
    user,
    bookingId,
    Number(formData.get("stars")),
    String(formData.get("comment") ?? "").slice(0, 1000),
  );
  if (!result.ok) return { error: result.error };
  revalidatePath(`/interviews/${bookingId}`);
  return {};
}
