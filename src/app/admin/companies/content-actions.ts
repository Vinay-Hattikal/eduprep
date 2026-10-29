"use server";

import { PUBLIC_QUESTIONS_TAG } from "@/server/services/public-questions";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { linkToCompany, unlinkFromCompany } from "@/server/services/company-links";
import { COMPANIES_TAG } from "@/server/services/public-companies";

const id = z.string().min(1).max(40);
const kind = z.enum(["question", "problem"]);
const slug = z.string().min(1).max(80);

function back(companySlug: string, itemKind: "question" | "problem", query: string) {
  revalidatePath(`/admin/companies/${companySlug}`);
  updateTag(COMPANIES_TAG);
  updateTag(PUBLIC_QUESTIONS_TAG);
  redirect(
    `/admin/companies/${companySlug}?tab=${itemKind === "question" ? "questions" : "coding"}${query}`,
  );
}

/** Links an existing question or coding problem to the company. */
export async function linkItemAction(formData: FormData) {
  const user = await requirePermission("companies.manage");
  const companySlug = slug.parse(formData.get("slug"));
  const companyId = id.parse(formData.get("companyId"));
  const itemKind = kind.parse(formData.get("kind"));
  const itemId = id.parse(formData.get("itemId"));
  await linkToCompany(
    companyId,
    itemKind === "question" ? { questionId: itemId } : { problemId: itemId },
    user,
  );
  const q = String(formData.get("q") ?? "").slice(0, 100);
  back(companySlug, itemKind, `&linked=1${q ? `&q=${encodeURIComponent(q)}` : ""}`);
}

/** Removes the company link; the question or problem itself stays. */
export async function unlinkItemAction(formData: FormData) {
  const user = await requirePermission("companies.manage");
  const companySlug = slug.parse(formData.get("slug"));
  const itemKind = kind.parse(formData.get("kind"));
  await unlinkFromCompany(id.parse(formData.get("linkId")), user);
  back(companySlug, itemKind, "&unlinked=1");
}
