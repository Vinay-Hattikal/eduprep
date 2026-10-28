"use server";

import { revalidatePath, updateTag } from "next/cache";
import { COMPANIES_TAG } from "@/server/services/public-companies";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import {
  createNodeSchema,
  createTaxonomyNode,
  updateNodeSchema,
  updateTaxonomyNode,
} from "@/server/services/taxonomy";

export type TaxonomyFormState = { error?: string; ok?: boolean };

const level = z.enum(["subject", "topic", "subtopic"]);

function firstIssue(error: z.ZodError) {
  const issue = error.issues[0];
  return issue
    ? `${String(issue.path[0] ?? "")}: ${issue.message}`.replace(/^: /, "")
    : "Invalid input.";
}

export async function createNodeAction(
  _prev: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  const user = await requirePermission("taxonomy.manage");
  const nodeLevel = level.safeParse(formData.get("level"));
  const input = createNodeSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
  });
  if (!nodeLevel.success) return { error: "Unknown level." };
  if (!input.success) return { error: firstIssue(input.error) };

  const parentId = formData.get("parentId");
  const result = await createTaxonomyNode(
    nodeLevel.data,
    typeof parentId === "string" ? parentId : null,
    input.data,
    user.id,
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/taxonomy");
  updateTag(COMPANIES_TAG);
  return { ok: true };
}

export async function updateNodeAction(
  _prev: TaxonomyFormState,
  formData: FormData,
): Promise<TaxonomyFormState> {
  const user = await requirePermission("taxonomy.manage");
  const nodeLevel = level.safeParse(formData.get("level"));
  const input = updateNodeSchema.safeParse({
    name: formData.get("name"),
    order: formData.get("order"),
  });
  if (!nodeLevel.success) return { error: "Unknown level." };
  if (!input.success) return { error: firstIssue(input.error) };

  const result = await updateTaxonomyNode(
    nodeLevel.data,
    String(formData.get("id") ?? ""),
    input.data,
    user.id,
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/taxonomy");
  updateTag(COMPANIES_TAG);
  return { ok: true };
}
