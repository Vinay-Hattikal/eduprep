"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { fieldErrors, problemFormFromData, solutionFormSchema } from "@/schemas/admin-content";
import {
  addTestCase,
  deleteSolution,
  deleteTestCase,
  requestValidation,
  saveProblem,
  saveSolution,
  transitionProblem,
} from "@/server/services/problems";

const id = z.string().min(1).max(40);
const back = (problemId: string, query: string) =>
  redirect(`/admin/problems/${problemId}?${query}`);

export async function validateProblemAction(formData: FormData) {
  await requirePermission("content.edit");
  const problemId = id.parse(formData.get("id"));
  await requestValidation(problemId);
  revalidatePath(`/admin/problems/${problemId}`);
  back(problemId, "validating=1");
}

const actionSchema = z.enum(["submit", "approve", "reject", "archive", "restore"]);

export async function transitionProblemAction(formData: FormData) {
  const user = await requirePermission("content.view");
  const problemId = id.parse(formData.get("id"));
  const action = actionSchema.safeParse(formData.get("action"));
  if (!action.success) back(problemId, "");
  const result = await transitionProblem(
    problemId,
    action.data!,
    user,
    String(formData.get("note") ?? ""),
  );
  revalidatePath("/admin/problems");
  revalidatePath(`/admin/problems/${problemId}`);
  back(problemId, result.ok ? `done=${action.data}` : `error=${encodeURIComponent(result.error)}`);
}

export type ProblemFormState = { fieldErrors?: Record<string, string>; formError?: string };

export async function saveProblemAction(
  _prev: ProblemFormState,
  formData: FormData,
): Promise<ProblemFormState> {
  const user = await requirePermission("content.edit");
  const parsed = problemFormFromData(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), formError: "Fix the highlighted fields." };
  const { hints, ...values } = parsed.data;
  const result = await saveProblem({ ...values, hints: hints.filter(Boolean) }, user);
  if (!result.ok)
    return {
      fieldErrors: result.fieldErrors,
      formError: result.formError ?? "Fix the highlighted fields.",
    };
  revalidatePath("/admin/problems");
  if (result.created) back(result.id, "created=1");
  back(
    result.id,
    `saved=1${result.movedToDraft ? "&draft=1" : ""}${result.revalidating ? "&validating=1" : ""}`,
  );
  return {};
}

export async function saveSolutionAction(
  _prev: ProblemFormState,
  formData: FormData,
): Promise<ProblemFormState> {
  const user = await requirePermission("content.edit");
  const parsed = solutionFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), formError: "Check the code." };
  const result = await saveSolution(parsed.data, user);
  if (!result.ok) return { formError: result.error };
  revalidatePath(`/admin/problems/${parsed.data.problemId}`);
  back(parsed.data.problemId, `solution=saved${result.revalidating ? "&validating=1" : ""}`);
  return {};
}

export async function deleteSolutionAction(formData: FormData) {
  const user = await requirePermission("content.edit");
  const problemId = id.parse(formData.get("problemId"));
  const result = await deleteSolution(problemId, id.parse(formData.get("solutionId")), user);
  revalidatePath(`/admin/problems/${problemId}`);
  back(problemId, `solution=deleted${result.revalidating ? "&validating=1" : ""}`);
}

const testSchema = z.object({
  problemId: id,
  isSample: z.enum(["yes", "no"]),
  input: z.string().max(100_000),
  output: z.string().min(1, "Expected output is required.").max(100_000),
  explanation: z.string().trim().max(2000),
});

export async function addTestCaseAction(
  _prev: ProblemFormState,
  formData: FormData,
): Promise<ProblemFormState> {
  const user = await requirePermission("content.edit");
  const parsed = testSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { formError: parsed.error.issues[0]?.message ?? "Check the test." };
  const { isSample, explanation, ...values } = parsed.data;
  await addTestCase(
    { ...values, isSample: isSample === "yes", explanation: explanation || null },
    user,
  );
  revalidatePath(`/admin/problems/${values.problemId}`);
  back(values.problemId, "test=added&validating=1");
  return {};
}

export async function deleteTestCaseAction(formData: FormData) {
  const user = await requirePermission("content.edit");
  const problemId = id.parse(formData.get("problemId"));
  await deleteTestCase(problemId, id.parse(formData.get("testId")), user);
  revalidatePath(`/admin/problems/${problemId}`);
  back(problemId, "test=deleted&validating=1");
}
