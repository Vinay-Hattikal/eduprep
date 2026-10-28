"use server";

import { z } from "zod";
import { CODING_LANGUAGE_IDS } from "@/lib/coding/languages";
import { requirePermission } from "@/server/auth";
import {
  createSubmission,
  getSubmission,
  MAX_CODE_CHARS,
  MAX_CUSTOM_INPUT_CHARS,
  revealHint,
  type SubmissionView,
  type SubmitResult,
} from "@/server/services/coding";

const runSchema = z.object({
  problemId: z.string().min(1).max(40),
  language: z.enum(CODING_LANGUAGE_IDS),
  code: z.string().max(MAX_CODE_CHARS),
  kind: z.enum(["RUN", "SUBMIT"]),
  customInput: z.string().max(MAX_CUSTOM_INPUT_CHARS).nullable().optional(),
});

export async function runCodeAction(input: z.input<typeof runSchema>): Promise<SubmitResult> {
  const user = await requirePermission("student.access");
  const parsed = runSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", message: "Code or input is too long." };
  return createSubmission(user, parsed.data);
}

export async function pollSubmissionAction(id: string): Promise<SubmissionView | null> {
  const user = await requirePermission("student.access");
  return getSubmission(user.id, z.string().max(40).parse(id));
}

export async function revealHintAction(problemId: string): Promise<void> {
  const user = await requirePermission("student.access");
  await revealHint(user, z.string().max(40).parse(problemId));
}
