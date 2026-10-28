"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { designFormFromData, fieldErrors } from "@/schemas/admin-content";
import { requirePermission } from "@/server/auth";
import { saveDesignQuestion, setDesignStatus } from "@/server/services/design-questions";

export type DesignFormState = { fieldErrors?: Record<string, string>; formError?: string };

export async function saveDesignAction(
  _prev: DesignFormState,
  formData: FormData,
): Promise<DesignFormState> {
  const user = await requirePermission("content.edit");
  const parsed = designFormFromData(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), formError: "Fix the highlighted fields." };
  const result = await saveDesignQuestion(parsed.data, user);
  if (!result.ok)
    return {
      fieldErrors: result.fieldErrors,
      formError: result.formError ?? "Fix the highlighted fields.",
    };
  revalidatePath("/admin/design");
  redirect(
    `/admin/design/${result.id}?${result.created ? "created=1" : `saved=1${result.movedToDraft ? "&draft=1" : ""}`}`,
  );
}

export async function setDesignStatusAction(formData: FormData) {
  const actor = await requirePermission("content.publish");
  const id = z.string().min(1).max(40).parse(formData.get("id"));
  const status = z.enum(["PUBLISHED", "DRAFT", "ARCHIVED"]).parse(formData.get("status"));
  await setDesignStatus(id, status, actor);
  revalidatePath("/admin/design");
  revalidatePath(`/admin/design/${id}`);
  if (formData.get("back") === "detail") redirect(`/admin/design/${id}`);
}
