"use server";

import { revalidatePath, updateTag } from "next/cache";
import { COMPANIES_TAG } from "@/server/services/public-companies";
import { redirect } from "next/navigation";
import { z } from "zod";
import { questionFormFromData } from "@/schemas/question";
import { requirePermission } from "@/server/auth";
import {
  bulkTransition,
  getQuestion,
  saveQuestion,
  transitionQuestion,
} from "@/server/services/questions";

export type QuestionFormState = { fieldErrors?: Record<string, string>; formError?: string };

export async function saveQuestionAction(
  _prev: QuestionFormState,
  formData: FormData,
): Promise<QuestionFormState> {
  const user = await requirePermission("content.edit");
  const parsed = questionFormFromData(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      fieldErrors[field] ??= issue.message;
    }
    return { fieldErrors, formError: "Fix the highlighted fields." };
  }

  const result = await saveQuestion(parsed.data, user);
  if (!result.ok) {
    return {
      fieldErrors: result.fieldErrors,
      formError: result.formError ?? "Fix the highlighted fields.",
    };
  }
  // "Save and publish" (D-056): the question goes live straight away.
  let query = `saved=1${result.movedToDraft ? "&draft=1" : ""}`;
  if (formData.get("intent") === "publish") {
    const status = (await getQuestion(result.id))?.status;
    if (status !== "PUBLISHED") {
      const published = await transitionQuestion(result.id, "publish", user);
      query = published.ok
        ? "saved=1&published=1"
        : `saved=1&error=${encodeURIComponent(published.error)}`;
    }
  }
  revalidatePath("/admin/questions");
  updateTag(COMPANIES_TAG);
  redirect(`/admin/questions/${result.id}?${query}`);
}

const actionSchema = z.enum(["publish", "unpublish", "archive", "restore"]);

export async function transitionQuestionAction(formData: FormData) {
  const user = await requirePermission("content.view");
  const id = String(formData.get("id") ?? "");
  const action = actionSchema.safeParse(formData.get("action"));
  if (!action.success) redirect(`/admin/questions/${id}`);

  const result = await transitionQuestion(id, action.data, user);
  revalidatePath("/admin/questions");
  updateTag(COMPANIES_TAG);
  revalidatePath("/admin/drafts");
  revalidatePath(`/admin/questions/${id}`);
  redirect(
    `/admin/questions/${id}?${result.ok ? `done=${action.data}` : `error=${encodeURIComponent(result.error)}`}`,
  );
}

export type BulkState = { message?: string; errors?: string[] };

export async function bulkQuestionAction(_prev: BulkState, formData: FormData): Promise<BulkState> {
  const user = await requirePermission("content.view");
  const action = actionSchema.safeParse(formData.get("action"));
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (!action.success) return { errors: ["Choose an action."] };
  if (ids.length === 0) return { errors: ["Select at least one question."] };

  const { done, errors } = await bulkTransition(ids, action.data, user);
  revalidatePath("/admin/questions");
  updateTag(COMPANIES_TAG);
  revalidatePath("/admin/drafts");
  return {
    message: `${done} of ${ids.length} question${ids.length === 1 ? "" : "s"} updated.`,
    errors,
  };
}
