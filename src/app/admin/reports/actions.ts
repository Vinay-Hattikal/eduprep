"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { resolveReport } from "@/server/services/reports";

export type ResolveState = { ok?: boolean; error?: string };

const schema = z.object({
  id: z.string().min(1),
  status: z.enum(["FIXED", "REJECTED"]),
  reply: z.string().trim().min(5, "Write a short reply for the student.").max(1000),
});

export async function resolveReportAction(
  _prev: ResolveState,
  formData: FormData,
): Promise<ResolveState> {
  const user = await requirePermission("content.edit");
  const parsed = schema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    reply: formData.get("reply"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const result = await resolveReport(
    parsed.data.id,
    parsed.data.status,
    parsed.data.reply,
    user.id,
  );
  if (!result.ok) return { error: result.error };
  revalidatePath("/admin/reports");
  revalidatePath("/admin");
  return { ok: true };
}
