"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { CODING_LANGUAGE_IDS } from "@/lib/coding/languages";
import { OPTION_LETTERS } from "@/lib/content/question-rules";
import { requirePermission } from "@/server/auth";
import {
  MAX_CODE_CHARS,
  MAX_CUSTOM_INPUT_CHARS,
  type SubmitResult,
} from "@/server/services/coding";
import {
  advanceSection,
  recordTabSwitch,
  saveItem,
  startSitting,
  submitSitting,
  submitSittingCode,
  type ItemPatch,
  type SaveResult,
} from "@/server/services/tests";

const id = z.string().min(1).max(40);

export type StartState = { error?: string };

export async function startTestAction(_prev: StartState, formData: FormData): Promise<StartState> {
  const user = await requirePermission("student.access");
  const slug = z.string().max(120).safeParse(formData.get("slug"));
  if (!slug.success) return { error: "This test isn't available." };
  const result = await startSitting(user, slug.data);
  if (result.status === "started") redirect(`/exam/${result.sittingId}`);
  if (result.status === "locked") {
    return {
      error:
        "You've taken the free mock for this company. Paid plans with unlimited mocks are coming soon.",
    };
  }
  if (result.status === "not-enough") return { error: result.message };
  return { error: "This test isn't available." };
}

const patchSchema = z.object({
  selectedOptions: z.array(z.enum(OPTION_LETTERS)).max(5).optional(),
  numericAnswer: z.number().finite().nullable().optional(),
  markedForReview: z.boolean().optional(),
  visited: z.boolean().optional(),
  addTimeSec: z.number().min(0).max(3600).optional(),
});

export async function saveItemAction(
  sittingId: string,
  itemId: string,
  patch: ItemPatch,
): Promise<SaveResult> {
  const user = await requirePermission("student.access");
  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return saveItem(user, id.parse(sittingId), id.parse(itemId), parsed.data);
}

export async function advanceSectionAction(sittingId: string, from: number): Promise<boolean> {
  const user = await requirePermission("student.access");
  return advanceSection(user, id.parse(sittingId), z.number().int().min(0).max(20).parse(from));
}

export async function tabSwitchAction(sittingId: string): Promise<void> {
  const user = await requirePermission("student.access");
  await recordTabSwitch(user, id.parse(sittingId));
}

export async function submitTestAction(sittingId: string): Promise<void> {
  const user = await requirePermission("student.access");
  await submitSitting(user, id.parse(sittingId));
  redirect(`/tests/results/${sittingId}`);
}

const codeSchema = z.object({
  language: z.enum(CODING_LANGUAGE_IDS),
  code: z.string().max(MAX_CODE_CHARS),
  kind: z.enum(["RUN", "SUBMIT"]),
  customInput: z.string().max(MAX_CUSTOM_INPUT_CHARS).nullable().optional(),
});

export async function runTestCodeAction(
  sittingId: string,
  itemId: string,
  input: z.input<typeof codeSchema>,
): Promise<SubmitResult | { status: "closed" }> {
  const user = await requirePermission("student.access");
  const parsed = codeSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", message: "Code or input is too long." };
  return submitSittingCode(user, id.parse(sittingId), id.parse(itemId), parsed.data);
}
