"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { blueprintFormSchema } from "@/schemas/blueprint";
import { requirePermission } from "@/server/auth";
import { saveBlueprint, transitionBlueprint } from "@/server/services/blueprints";
import { PUBLIC_CATALOG_TAG } from "@/server/services/public-catalog";

export type BlueprintFormState = { errors?: string[] };

export async function saveBlueprintAction(
  _prev: BlueprintFormState,
  formData: FormData,
): Promise<BlueprintFormState> {
  const user = await requirePermission("content.edit");
  let json: unknown;
  try {
    json = JSON.parse(String(formData.get("blueprint") ?? ""));
  } catch {
    return { errors: ["The form couldn't be read. Reload and try again."] };
  }
  const parsed = blueprintFormSchema.safeParse(json);
  if (!parsed.success) {
    return {
      errors: parsed.error.issues.map((issue) => {
        const where = issue.path.length
          ? `${issue.path.map((p) => (typeof p === "number" ? p + 1 : p)).join(" › ")}: `
          : "";
        return `${where}${issue.message}`;
      }),
    };
  }
  const result = await saveBlueprint(parsed.data, user);
  if (!result.ok) return { errors: Object.values(result.fieldErrors) };
  revalidatePath("/admin/tests");
  revalidatePath("/tests");
  updateTag(PUBLIC_CATALOG_TAG);
  redirect(`/admin/tests/${result.id}?saved=1`);
}

const actionSchema = z.enum(["publish", "unpublish", "archive", "restore"]);

export async function transitionBlueprintAction(formData: FormData) {
  const user = await requirePermission("content.publish");
  const id = z.string().min(1).max(40).parse(formData.get("id"));
  const action = actionSchema.parse(formData.get("action"));
  const result = await transitionBlueprint(id, action, user);
  revalidatePath("/admin/tests");
  revalidatePath("/tests");
  updateTag(PUBLIC_CATALOG_TAG);
  redirect(
    `/admin/tests/${id}?${result.ok ? `done=${action}` : `errors=${encodeURIComponent(JSON.stringify(result.errors))}`}`,
  );
}
