"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/server/auth";
import { updateSetting } from "@/server/services/settings";
import { isSettingKey, parseSettingInput } from "@/server/services/settings/registry";

export type SettingFormState = { status: "idle" | "success" | "error"; message?: string };

export async function updateSettingAction(
  _previous: SettingFormState,
  formData: FormData,
): Promise<SettingFormState> {
  const user = await requirePermission("settings.manage");

  const key = String(formData.get("key") ?? "");
  if (!isSettingKey(key)) return { status: "error", message: "Unknown setting." };

  const value = parseSettingInput(key, String(formData.get("value") ?? ""));
  if (value === null)
    return { status: "error", message: "Enter a valid number in the allowed range." };

  await updateSetting(key, value, user.id);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/audit-log");
  return { status: "success", message: "Saved" };
}
