"use server";

import { revalidatePath, updateTag } from "next/cache";
import { COMPANIES_TAG } from "@/server/services/public-companies";
import { redirect } from "next/navigation";
import { z } from "zod";
import { companyFormFromData } from "@/schemas/company";
import { requirePermission } from "@/server/auth";
import { todayUtc } from "@/server/imports/definitions/companies";
import {
  getCompanyBySlug,
  markCompanyVerified,
  saveCompany,
  setCompanyStatus,
} from "@/server/services/companies";

export type CompanyFormState = { fieldErrors?: Record<string, string>; formError?: string };

export async function saveCompanyAction(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const user = await requirePermission("companies.manage");
  const parsed = companyFormFromData(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { fieldErrors, formError: "Fix the highlighted fields." };
  }
  const result = await saveCompany(parsed.data, user);
  if (!result.ok)
    return {
      fieldErrors: result.fieldErrors,
      formError: result.formError ?? "Fix the highlighted fields.",
    };
  // "Save and publish" (D-056). Publishing still needs at least one source.
  let query = "saved=1";
  if (formData.get("intent") === "publish") {
    const company = await getCompanyBySlug(result.slug);
    if (company && company.status !== "PUBLISHED") {
      const published = await setCompanyStatus(company.id, "publish", user);
      query = published.ok
        ? "saved=1&published=1"
        : `saved=1&error=${encodeURIComponent(published.error)}`;
    }
  }
  revalidatePath("/admin/companies");
  updateTag(COMPANIES_TAG);
  redirect(`/admin/companies/${result.slug}?${query}`);
}

const statusAction = z.enum(["publish", "unpublish", "archive", "restore"]);

export async function companyStatusAction(formData: FormData) {
  const user = await requirePermission("companies.publish");
  const id = String(formData.get("id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const action = statusAction.safeParse(formData.get("action"));
  if (!action.success) redirect(`/admin/companies/${slug}`);
  const result = await setCompanyStatus(id, action.data, user);
  revalidatePath("/admin/companies");
  updateTag(COMPANIES_TAG);
  redirect(
    `/admin/companies/${slug}${result.ok ? "" : `?error=${encodeURIComponent(result.error)}`}`,
  );
}

export async function verifyCompanyAction(formData: FormData) {
  const user = await requirePermission("companies.manage");
  const slug = String(formData.get("slug") ?? "");
  await markCompanyVerified(String(formData.get("id") ?? ""), user, todayUtc());
  revalidatePath("/admin/companies");
  updateTag(COMPANIES_TAG);
  redirect(`/admin/companies/${slug}?verified=1`);
}
