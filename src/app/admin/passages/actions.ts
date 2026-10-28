"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fieldErrors, passageFormFromData } from "@/schemas/admin-content";
import { requirePermission } from "@/server/auth";
import { deletePassage, savePassage } from "@/server/services/passages";

export type PassageFormState = { fieldErrors?: Record<string, string>; formError?: string };

export async function savePassageAction(
  _prev: PassageFormState,
  formData: FormData,
): Promise<PassageFormState> {
  const user = await requirePermission("content.edit");
  const parsed = passageFormFromData(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), formError: "Fix the highlighted fields." };
  const result = await savePassage(parsed.data, user);
  if (!result.ok)
    return {
      fieldErrors: result.fieldErrors,
      formError: result.formError ?? "Fix the highlighted fields.",
    };
  revalidatePath("/admin/passages");
  redirect(`/admin/passages/${result.id}?${result.created ? "created=1" : "saved=1"}`);
}

export async function deletePassageAction(formData: FormData) {
  const user = await requirePermission("content.edit");
  const id = z.string().min(1).max(40).parse(formData.get("id"));
  const result = await deletePassage(id, user);
  revalidatePath("/admin/passages");
  if (!result.ok) redirect(`/admin/passages/${id}?error=${encodeURIComponent(result.error)}`);
  redirect("/admin/passages?deleted=1");
}
