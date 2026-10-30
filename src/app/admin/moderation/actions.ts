"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { moderateDriveReport } from "@/server/services/drive-reports";
import { moderateExperience } from "@/server/services/experiences";

// Approve or reject student content, from the moderation queues or a company's Community tab
// (D-067). `back` is where to return: an admin page.

const back = (formData: FormData) => {
  const path = String(formData.get("back") ?? "");
  return /^\/admin\/[\w/?=&.-]*$/.test(path) ? path : "/admin";
};
const withError = (path: string, error: string) =>
  `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(error)}`;

export async function moderateExperienceAction(formData: FormData) {
  const actor = await requirePermission("experiences.moderate");
  const decision = z.enum(["approve", "reject"]).parse(formData.get("decision"));
  const result = await moderateExperience(
    z.string().max(40).parse(formData.get("id")),
    decision,
    actor,
    {
      rounds: String(formData.get("rounds") ?? "").trim() || undefined,
      questions: String(formData.get("questions") ?? "").trim() || undefined,
      tips: String(formData.get("tips") ?? "").trim() || null,
    },
    String(formData.get("note") ?? ""),
  );
  const to = back(formData);
  revalidatePath(to.split("?")[0]!);
  if (!result.ok) redirect(withError(to, result.error));
  revalidatePath(`/companies/${result.companySlug}/experiences`);
  redirect(to);
}

export async function moderateDriveReportAction(formData: FormData) {
  const actor = await requirePermission("experiences.moderate");
  const decision = z.enum(["approve", "reject"]).parse(formData.get("decision"));
  const result = await moderateDriveReport(
    z.string().max(40).parse(formData.get("id")),
    decision,
    actor,
    {
      questions: String(formData.get("questions") ?? "").trim() || undefined,
      topics: String(formData.get("topics") ?? "").trim() || null,
    },
    String(formData.get("note") ?? ""),
  );
  const to = back(formData);
  revalidatePath(to.split("?")[0]!);
  if (!result.ok) redirect(withError(to, result.error));
  revalidatePath(`/companies/${result.companySlug}`);
  redirect(to);
}
