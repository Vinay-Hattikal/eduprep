"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { companyTabHref } from "@/lib/content/companies";
import { requirePermission } from "@/server/auth";
import { moderateDriveReport } from "@/server/services/drive-reports";
import { moderateExperience } from "@/server/services/experiences";

// Approve or reject student content, from a moderation queue or a company's Community tab
// (D-067). The form says which ("from"); the server picks the page to return to.

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

async function moderate(
  formData: FormData,
  queue: string,
  run: (
    id: string,
    decision: "approve" | "reject",
    actor: { id: string },
  ) => Promise<{ ok: true; companySlug: string } | { ok: false; error: string }>,
  publicPath: (slug: string) => string,
) {
  const actor = await requirePermission("experiences.moderate");
  const decision = z.enum(["approve", "reject"]).parse(formData.get("decision"));
  const result = await run(z.string().max(40).parse(formData.get("id")), decision, actor);
  const company = formData.get("from") === "company" ? text(formData, "companySlug") : null;
  const back = company ? companyTabHref(company, "community") : queue;
  revalidatePath(company ? `/admin/companies/${company}` : queue);
  if (!result.ok)
    redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(result.error)}`);
  revalidatePath(publicPath(result.companySlug));
  redirect(back);
}

export async function moderateExperienceAction(formData: FormData) {
  await moderate(
    formData,
    "/admin/experiences",
    (id, decision, actor) =>
      moderateExperience(
        id,
        decision,
        actor,
        {
          rounds: text(formData, "rounds") || undefined,
          questions: text(formData, "questions") || undefined,
          tips: text(formData, "tips") || null,
        },
        text(formData, "note"),
      ),
    (slug) => `/companies/${slug}/experiences`,
  );
}

export async function moderateDriveReportAction(formData: FormData) {
  await moderate(
    formData,
    "/admin/drive-reports",
    (id, decision, actor) =>
      moderateDriveReport(
        id,
        decision,
        actor,
        {
          questions: text(formData, "questions") || undefined,
          topics: text(formData, "topics") || null,
        },
        text(formData, "note"),
      ),
    (slug) => `/companies/${slug}`,
  );
}
