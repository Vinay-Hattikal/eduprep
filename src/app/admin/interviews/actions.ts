"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import {
  cancelBooking,
  decideInterviewer,
  markInterviewerNoShow,
  recordPayout,
  type InterviewerDecision,
} from "@/server/services/interviews";

const id = z.string().min(1).max(40);

export async function decideInterviewerAction(formData: FormData) {
  const user = await requirePermission("interviews.manage");
  const decision = z
    .enum(["approve", "reject", "suspend", "reinstate", "clear-flag"])
    .parse(formData.get("decision")) as InterviewerDecision;
  const result = await decideInterviewer(
    id.parse(formData.get("userId")),
    decision,
    user,
    String(formData.get("note") ?? "").trim() || undefined,
  );
  revalidatePath("/admin/interviewers");
  if (!result.ok) redirect(`/admin/interviewers?error=${encodeURIComponent(result.error)}`);
}

export async function adminCancelAction(formData: FormData) {
  const user = await requirePermission("interviews.manage");
  const reason =
    String(formData.get("reason") ?? "")
      .trim()
      .slice(0, 200) || "cancelled by the team";
  const result = await cancelBooking(id.parse(formData.get("bookingId")), "admin", user.id, reason);
  revalidatePath("/admin/interviews");
  if (!result.ok) redirect(`/admin/interviews?error=${encodeURIComponent(result.error)}`);
}

export async function interviewerNoShowAction(formData: FormData) {
  const user = await requirePermission("interviews.manage");
  const result = await markInterviewerNoShow(
    id.parse(formData.get("bookingId")),
    user,
    String(formData.get("note") ?? "").slice(0, 200) || "Interviewer didn't join",
  );
  revalidatePath("/admin/interviews");
  if (!result.ok) redirect(`/admin/interviews?error=${encodeURIComponent(result.error)}`);
}

export async function recordPayoutAction(formData: FormData) {
  const user = await requirePermission("interviews.manage");
  const rupees = Number(String(formData.get("amount") ?? "").replace(/,/g, ""));
  const reference = String(formData.get("reference") ?? "")
    .trim()
    .slice(0, 100);
  if (!Number.isFinite(rupees) || !reference)
    redirect(
      `/admin/payouts?error=${encodeURIComponent("Enter the amount and the bank reference.")}`,
    );
  const result = await recordPayout(
    id.parse(formData.get("interviewerId")),
    Math.round(rupees * 100),
    reference,
    user,
  );
  revalidatePath("/admin/payouts");
  redirect(`/admin/payouts?${result.ok ? "done=1" : `error=${encodeURIComponent(result.error)}`}`);
}
