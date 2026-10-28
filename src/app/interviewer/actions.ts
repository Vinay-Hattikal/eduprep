"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import {
  addBlockedDate,
  cancelBooking,
  markCandidateNoShow,
  removeBlockedDate,
  saveAvailability,
  submitScorecard,
} from "@/server/services/interviews";

export type FormState = { error?: string; saved?: boolean };

const ruleSchema = z.object({
  weekday: z.number().int().min(0).max(6),
  startMinute: z.number().int(),
  endMinute: z.number().int(),
});

export async function saveAvailabilityAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission("interviewer.access");
  let rules: unknown;
  try {
    rules = JSON.parse(String(formData.get("rules") ?? "[]"));
  } catch {
    return { error: "The form couldn't be read." };
  }
  const parsed = z.array(ruleSchema).max(50).safeParse(rules);
  if (!parsed.success) return { error: "Check the times." };
  const result = await saveAvailability(user.id, {
    timeZone: String(formData.get("timeZone") ?? ""),
    bufferMin: Number(formData.get("bufferMin")),
    rules: parsed.data,
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/interviewer/availability");
  return { saved: true };
}

export async function addBlockAction(formData: FormData) {
  const user = await requirePermission("interviewer.access");
  await addBlockedDate(
    user.id,
    String(formData.get("date") ?? ""),
    String(formData.get("note") ?? "").slice(0, 120) || null,
  );
  revalidatePath("/interviewer/availability");
}

export async function removeBlockAction(formData: FormData) {
  const user = await requirePermission("interviewer.access");
  await removeBlockedDate(user.id, z.string().max(40).parse(formData.get("id")));
  revalidatePath("/interviewer/availability");
}

const scorecardSchema = z.object({
  bookingId: z.string().max(40),
  scores: z
    .array(
      z.object({ key: z.string().max(60), score: z.number().int(), comment: z.string().max(2000) }),
    )
    .max(20),
  strengths: z.string().max(4000),
  improvements: z.string().max(4000),
  recommendation: z.enum(["HIRE", "BORDERLINE", "NOT_YET"]),
  recommendedTopics: z.array(z.string().max(80)).max(10),
});

export async function submitScorecardAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission("interviewer.access");
  let payload: unknown;
  try {
    payload = JSON.parse(String(formData.get("scorecard") ?? ""));
  } catch {
    return { error: "The form couldn't be read." };
  }
  const parsed = scorecardSchema.safeParse(payload);
  if (!parsed.success) return { error: "Score every item and pick a recommendation." };
  const { bookingId, ...input } = parsed.data;
  const result = await submitScorecard(user.id, bookingId, input);
  if (!result.ok) return { error: result.error };
  revalidatePath("/interviewer");
  redirect(`/interviewer/bookings/${bookingId}?submitted=1`);
}

export async function candidateNoShowAction(formData: FormData) {
  const user = await requirePermission("interviewer.access");
  const bookingId = z.string().max(40).parse(formData.get("bookingId"));
  const result = await markCandidateNoShow(user.id, bookingId);
  redirect(
    `/interviewer/bookings/${bookingId}?${result.ok ? "noshow=1" : `error=${encodeURIComponent(result.error)}`}`,
  );
}

export async function interviewerCancelAction(formData: FormData) {
  const user = await requirePermission("interviewer.access");
  const bookingId = z.string().max(40).parse(formData.get("bookingId"));
  const reason = String(formData.get("reason") ?? "")
    .trim()
    .slice(0, 200);
  if (!reason)
    redirect(
      `/interviewer/bookings/${bookingId}?error=${encodeURIComponent("Tell the candidate why.")}`,
    );
  const result = await cancelBooking(
    bookingId,
    "interviewer",
    user.id,
    `the interviewer had to cancel: ${reason}`,
  );
  redirect(
    `/interviewer/bookings/${bookingId}?${result.ok ? "cancelled=1" : `error=${encodeURIComponent(result.error)}`}`,
  );
}
