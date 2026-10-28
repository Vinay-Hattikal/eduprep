"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrors, interviewTypeFormFromData } from "@/schemas/admin-content";
import { requirePermission } from "@/server/auth";
import { saveInterviewType } from "@/server/services/interview-types";

export type InterviewTypeFormState = { fieldErrors?: Record<string, string>; formError?: string };

export async function saveInterviewTypeAction(
  _prev: InterviewTypeFormState,
  formData: FormData,
): Promise<InterviewTypeFormState> {
  const user = await requirePermission("interviews.manage");
  const parsed = interviewTypeFormFromData(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), formError: "Fix the highlighted fields." };
  const result = await saveInterviewType(parsed.data, user);
  if (!result.ok)
    return {
      fieldErrors: result.fieldErrors,
      formError: result.formError ?? "Fix the highlighted fields.",
    };
  revalidatePath("/admin/interview-types");
  revalidatePath("/interviews");
  redirect(`/admin/interview-types/${result.id}?${result.created ? "created=1" : "saved=1"}`);
}
