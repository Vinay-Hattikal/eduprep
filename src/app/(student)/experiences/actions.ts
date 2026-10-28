"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { submitExperience } from "@/server/services/experiences";

export type ShareState = { error?: string; done?: boolean; fieldErrors?: Record<string, string> };

const thisYear = new Date().getFullYear();

const schema = z.object({
  companyId: z.string().min(1, "Choose a company.").max(40),
  role: z.string().trim().min(2, "Which role?").max(80),
  profileType: z.enum(["FRESHER", "EXPERIENCED"]),
  yearsExperience: z.preprocess(
    (v) => (v === "" || v === undefined ? null : Number(v)),
    z.number().int().min(0).max(50).nullable(),
  ),
  year: z.coerce
    .number()
    .int()
    .min(thisYear - 5, "Only recent experiences, please.")
    .max(thisYear),
  rounds: z.string().trim().min(40, "Describe the rounds (40+ characters).").max(8000),
  questions: z.string().trim().min(20, "Share the questions you remember.").max(8000),
  tips: z
    .string()
    .trim()
    .max(3000)
    .transform((v) => v || null),
  result: z.enum(["SELECTED", "REJECTED", "WAITING", "WITHDREW"]),
  anonymous: z.preprocess((v) => v !== "no", z.boolean()),
});

export async function shareExperienceAction(
  _prev: ShareState,
  formData: FormData,
): Promise<ShareState> {
  const user = await requirePermission("student.access");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, error: "Fix the highlighted fields." };
  }
  const result = await submitExperience(user, parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/experiences/new");
  return { done: true };
}
