"use server";

import { revalidatePath } from "next/cache";
import { passageFormSchema } from "@/schemas/admin-content";
import { requirePermission } from "@/server/auth";
import { savePassage } from "@/server/services/passages";

export type QuickPassageResult = { ok: true; externalId: string } | { ok: false; error: string };

/** "+ New passage" in the question editor (D-067): creates a passage without leaving it. */
export async function quickPassageAction(input: {
  externalId: string;
  title: string;
  body: string;
}): Promise<QuickPassageResult> {
  const user = await requirePermission("content.edit");
  const parsed = passageFormSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the passage." };
  const result = await savePassage(parsed.data, user);
  if (!result.ok)
    return {
      ok: false,
      error: Object.values(result.fieldErrors)[0] ?? result.formError ?? "Check the passage.",
    };
  revalidatePath("/admin/passages");
  return { ok: true, externalId: parsed.data.externalId };
}
