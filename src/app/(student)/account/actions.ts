"use server";

import { revalidatePath } from "next/cache";
import { currentSessionId, requirePermission } from "@/server/auth";
import { changePassword, revokeOtherSessions } from "@/server/services/accounts";
import { db } from "@/server/db";

export async function setMarketingAction(formData: FormData) {
  const user = await requirePermission("student.access");
  await db.user.update({
    where: { id: user.id },
    data: { marketingOptIn: formData.get("optIn") === "yes" },
  });
  revalidatePath("/account");
}

/** Job alerts and All-India mock reminders (D-059). */
export async function setAlertsAction(formData: FormData) {
  const user = await requirePermission("student.access");
  await db.user.update({
    where: { id: user.id },
    data: { alertsOptIn: formData.get("optIn") === "yes" },
  });
  revalidatePath("/account");
}

export type PasswordState = { error?: string; field?: string; done?: boolean };

export async function changePasswordAction(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const user = await requirePermission("student.access");
  const result = await changePassword(
    user.id,
    String(formData.get("current") ?? ""),
    String(formData.get("password") ?? ""),
    await currentSessionId(),
  );
  if (!result.ok) return { error: result.error, field: result.field };
  revalidatePath("/account");
  return { done: true };
}

export async function signOutOthersAction() {
  const user = await requirePermission("student.access");
  await revokeOtherSessions(user.id, await currentSessionId());
  revalidatePath("/account");
}
