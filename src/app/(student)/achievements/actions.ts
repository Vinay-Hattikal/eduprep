"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { buyStreakFreeze, type FreezePurchase } from "@/server/services/engagement";
import { createShareCard, revokeShareCard, type ShareResult } from "@/server/services/share-cards";

const shareSchema = z.object({
  kind: z.enum(["TEST_RESULT", "CONTEST", "BADGE"]),
  refId: z.string().min(1).max(40),
});

export async function createShareAction(input: z.input<typeof shareSchema>): Promise<ShareResult> {
  const user = await requirePermission("student.access");
  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Nothing to share." };
  const result = await createShareCard(user, parsed.data.kind, parsed.data.refId);
  if (result.ok) revalidatePath("/achievements");
  return result;
}

export async function revokeShareAction(id: string): Promise<{ ok: boolean }> {
  const user = await requirePermission("student.access");
  const ok = await revokeShareCard(user, z.string().max(20).parse(id));
  revalidatePath("/achievements");
  return { ok };
}

export async function buyFreezeAction(): Promise<FreezePurchase> {
  const user = await requirePermission("student.access");
  const result = await buyStreakFreeze(user.id);
  revalidatePath("/achievements");
  revalidatePath("/dashboard");
  return result;
}
