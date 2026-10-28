"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/server/auth";
import { applyAsInterviewer } from "@/server/services/interviews";

export type ApplyState = { error?: string; done?: boolean; fieldErrors?: Record<string, string> };

const list = z
  .string()
  .optional()
  .transform((v) =>
    [
      ...new Set(
        (v ?? "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      ),
    ].slice(0, 10),
  );

const schema = z.object({
  headline: z.string().trim().min(5, "Add a one-line headline.").max(120),
  currentCompany: z.string().trim().min(2, "Where do you work?").max(80),
  currentRole: z.string().trim().min(2, "What's your role?").max(80),
  yearsExperience: z.coerce
    .number({ message: "Enter a number." })
    .int()
    .min(1, "At least 1 year.")
    .max(50),
  pastCompanies: list,
  languages: list.refine((v) => v.length > 0, "List at least one language."),
  linkedinUrl: z
    .string()
    .trim()
    .regex(/^https:\/\/(www\.)?linkedin\.com\/\S+$/i, "Paste your LinkedIn profile link."),
  bio: z.string().trim().min(40, "Tell candidates a little more (40+ characters).").max(1500),
  typeIds: z.array(z.string().max(40)).min(1, "Choose at least one interview type."),
});

export async function applyAction(_prev: ApplyState, formData: FormData): Promise<ApplyState> {
  const user = await requireUser();
  const parsed = schema.safeParse({
    ...Object.fromEntries(formData),
    typeIds: formData.getAll("typeIds"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, error: "Fix the highlighted fields." };
  }
  const result = await applyAsInterviewer(user, parsed.data);
  if (!result.ok) return { error: result.error };
  revalidatePath("/become-interviewer");
  return { done: true };
}
