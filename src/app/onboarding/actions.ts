"use server";

import { redirect } from "next/navigation";
import { istDay } from "@/lib/learning/dates";
import { onboardingFromData } from "@/schemas/onboarding";
import { requirePermission } from "@/server/auth";
import { saveOnboarding } from "@/server/services/onboarding";

export type OnboardingState = { fieldErrors?: Record<string, string>; formError?: string };

export async function saveOnboardingAction(
  _prev: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const user = await requirePermission("student.access");
  const parsed = onboardingFromData(formData, istDay().getUTCFullYear());
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { fieldErrors, formError: "Some answers need a fix." };
  }
  await saveOnboarding(user.id, parsed.data);
  redirect(user.onboarded ? "/dashboard?goals=updated" : "/dashboard?welcome=1");
}
