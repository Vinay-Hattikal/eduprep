"use server";

import { PUBLIC_QUESTIONS_TAG } from "@/server/services/public-questions";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { COMPANIES_TAG } from "@/server/services/public-companies";
import { quickCreateTopic } from "@/server/services/taxonomy";

export type QuickTopicResult =
  { ok: true; topic: { id: string; name: string } } | { ok: false; error: string };

/**
 * Creates a topic from an editor (D-057). `subject` is a subject id, or "dsa" for coding
 * problems, whose topics always live in the DSA subject.
 */
export async function quickTopicAction(subject: string, name: string): Promise<QuickTopicResult> {
  const user = await requirePermission("taxonomy.manage");
  const parsed = z.object({ subject: z.string().min(1).max(40), name: z.string().max(200) });
  const input = parsed.safeParse({ subject, name });
  if (!input.success) return { ok: false, error: "Name the topic." };
  const subjectId =
    input.data.subject === "dsa"
      ? (await db.subject.findUnique({ where: { slug: "dsa" }, select: { id: true } }))?.id
      : input.data.subject;
  if (!subjectId) return { ok: false, error: "There's no DSA subject. Add it in Taxonomy." };
  const result = await quickCreateTopic(subjectId, input.data.name, user.id);
  if (result.ok) {
    revalidatePath("/admin/taxonomy");
    updateTag(COMPANIES_TAG);
    updateTag(PUBLIC_QUESTIONS_TAG);
  }
  return result;
}
