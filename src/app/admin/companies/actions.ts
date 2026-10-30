"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fieldErrors } from "@/schemas/admin-content";
import { companyFormFromData } from "@/schemas/company";
import { requirePermission } from "@/server/auth";
import { refreshPublicPages } from "@/server/services/public-pages";
import { todayUtc } from "@/server/imports/definitions/companies";
import { markCompanyVerified, saveCompany, setCompanyStatus } from "@/server/services/companies";
import { publishCompanyContent } from "@/server/services/company-publish";

export type CompanyFormState = { fieldErrors?: Record<string, string>; formError?: string };

export async function saveCompanyAction(
  _prev: CompanyFormState,
  formData: FormData,
): Promise<CompanyFormState> {
  const user = await requirePermission("companies.manage");
  const parsed = companyFormFromData(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), formError: "Fix the highlighted fields." };
  const result = await saveCompany(parsed.data, user);
  if (!result.ok)
    return {
      fieldErrors: result.fieldErrors,
      formError: result.formError ?? "Fix the highlighted fields.",
    };
  // "Save and publish" (D-056). Publishing still needs at least one source.
  let query = "saved=1";
  if (formData.get("intent") === "publish" && result.status !== "PUBLISHED") {
    const published = await setCompanyStatus(result.id, "publish", user);
    query = published.ok
      ? "saved=1&published=1"
      : `saved=1&error=${encodeURIComponent(published.error)}`;
  }
  revalidatePath("/admin/companies");
  refreshPublicPages();
  // A new company lands on its Overview checklist; edits stay on the Profile tab.
  redirect(`/admin/companies/${result.slug}?${parsed.data.id ? "tab=profile&" : ""}${query}`);
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
  refreshPublicPages();
  redirect(
    `/admin/companies/${slug}${result.ok ? "" : `?error=${encodeURIComponent(result.error)}`}`,
  );
}

export async function verifyCompanyAction(formData: FormData) {
  const user = await requirePermission("companies.manage");
  const slug = String(formData.get("slug") ?? "");
  await markCompanyVerified(String(formData.get("id") ?? ""), user, todayUtc());
  revalidatePath("/admin/companies");
  refreshPublicPages();
  redirect(`/admin/companies/${slug}?verified=1`);
}

/** "Publish everything" (D-067): the company's ready drafts, the company and its mock. */
export async function publishCompanyContentAction(formData: FormData) {
  const user = await requirePermission("companies.publish");
  const id = String(formData.get("id") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const result = await publishCompanyContent(id, user);
  if ("error" in result)
    redirect(`/admin/companies/${slug}?error=${encodeURIComponent(result.error)}`);
  revalidatePath("/admin/companies");
  refreshPublicPages();
  // The counts for the banner; the Overview's refreshed plan says why anything stayed draft.
  const counts = new URLSearchParams({
    published: "1",
    questions: String(result.questions),
    problems: String(result.problems),
    interviews: String(result.interviews),
    mocks: String(result.mocks),
    company: result.company ? "1" : "0",
  });
  redirect(`/admin/companies/${slug}?${counts}`);
}
