"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { addDays, istDay } from "@/lib/learning/dates";
import { requirePermission } from "@/server/auth";
import { REPORT_WINDOW_DAYS, submitDriveReport } from "@/server/services/drive-reports";

export type ReportState = { error?: string; done?: boolean; fieldErrors?: Record<string, string> };

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

const schema = z.object({
  companyId: z.string().min(1, "Choose a company.").max(40),
  daysAgo: z.coerce.number().int().min(0).max(REPORT_WINDOW_DAYS),
  roundType: z.enum([
    "ONLINE_TEST",
    "CODING_TEST",
    "GROUP_DISCUSSION",
    "TECHNICAL_INTERVIEW",
    "HR_INTERVIEW",
    "MANAGERIAL_INTERVIEW",
  ]),
  platform: optional(80),
  topics: optional(500),
  questions: z.string().trim().min(20, "Share at least one question (20+ characters).").max(5000),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]),
  location: optional(80),
});

export async function submitDriveReportAction(
  _prev: ReportState,
  formData: FormData,
): Promise<ReportState> {
  const user = await requirePermission("student.access");
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors, error: "Fix the highlighted fields." };
  }
  const { daysAgo, ...input } = parsed.data;
  const result = await submitDriveReport(user, {
    ...input,
    driveDate: addDays(istDay(), -daysAgo),
  });
  if (!result.ok) return { error: result.error };
  revalidatePath("/asked/new");
  return { done: true };
}
