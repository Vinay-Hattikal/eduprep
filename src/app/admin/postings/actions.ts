"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { jobPostingFromData } from "@/schemas/job-posting";
import { requirePermission } from "@/server/auth";
import { savePosting, setPostingStatus } from "@/server/services/job-postings";

export type PostingFormState = { fieldErrors?: Record<string, string>; formError?: string };

export async function savePostingAction(
  _prev: PostingFormState,
  formData: FormData,
): Promise<PostingFormState> {
  const user = await requirePermission("postings.manage");
  const parsed = jobPostingFromData(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { fieldErrors, formError: "Fix the highlighted fields." };
  }
  const result = await savePosting(parsed.data, user);
  if (!result.ok)
    return {
      fieldErrors: result.fieldErrors,
      formError: result.formError ?? "Fix the highlighted fields.",
    };
  revalidatePath("/admin/postings");
  revalidatePath("/jobs");
  redirect(`/admin/postings/${result.id}?saved=1`);
}

const statusAction = z.enum(["publish", "close", "reopen", "unpublish"]);

export async function postingStatusAction(formData: FormData) {
  const user = await requirePermission("postings.manage");
  const id = z.string().max(40).parse(formData.get("id"));
  const action = statusAction.parse(formData.get("action"));
  const result = await setPostingStatus(id, action, user);
  revalidatePath("/admin/postings");
  revalidatePath("/jobs");
  redirect(
    `/admin/postings/${id}${result.ok ? `?done=${action}` : `?error=${encodeURIComponent(result.error)}`}`,
  );
}
