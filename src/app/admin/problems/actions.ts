"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { askedAtFromFormData, readAskedAt } from "@/lib/content/asked-at";
import { requirePermission } from "@/server/auth";
import { refreshPublicPages } from "@/server/services/public-pages";
import { companyLinksProblem, setCompanyLinks } from "@/server/services/company-links";
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
/** Back to the problem page. Typed `never` so TypeScript knows nothing runs after it. */
const back: (problemId: string, query: string) => never = (problemId, query) =>
  redirect(`/admin/problems/${problemId}?${query}`);

export async function validateProblemAction(formData: FormData) {
  await requirePermission("content.edit");
  const problemId = id.parse(formData.get("id"));
  await requestValidation(problemId);
  revalidatePath(`/admin/problems/${problemId}`);
  back(problemId, "validating=1");
}

const actionSchema = z.enum(["publish", "unpublish", "archive", "restore"]);

export async function transitionProblemAction(formData: FormData) {
  const user = await requirePermission("content.publish");
  const problemId = id.parse(formData.get("id"));
  const action = actionSchema.safeParse(formData.get("action"));
  if (!action.success) back(problemId, "");
  // Not checked in the judge yet: run the check now and publish if it passes (D-056).
  if (action.data === "publish" && formData.get("afterCheck") === "1") {
    await requestValidation(problemId, user.id);
    revalidatePath(`/admin/problems/${problemId}`);
    back(problemId, "validating=1&publishing=1");
  }
  const result = await transitionProblem(problemId, action.data!, user);
  revalidatePath("/admin/problems");
  revalidatePath(`/admin/problems/${problemId}`);
  refreshPublicPages();
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
  const asked = readAskedAt(askedAtFromFormData(formData), new Date());
  const linkError = asked.error ?? (await companyLinksProblem(asked.links));
  if (linkError) return { fieldErrors: { companies: linkError }, formError: linkError };
  const { hints, ...values } = parsed.data;
  const publish = formData.get("intent") === "publish";
  const result = await saveProblem({ ...values, hints: hints.filter(Boolean) }, user, {
    publishAfterCheck: publish,
  });
  if (!result.ok)
    return {
      fieldErrors: result.fieldErrors,
      formError: result.formError ?? "Fix the highlighted fields.",
    };
  await setCompanyLinks({ problemId: result.id }, asked.links, user);
  revalidatePath("/admin/problems");
  refreshPublicPages();
  if (result.created) back(result.id, "created=1");

  // "Save and publish" (D-056): publish now if the judge check still holds, else check first.
  if (publish && !result.published) {
    if (!result.validated) {
      // A check this save already queued carries the publish request; otherwise queue one.
      if (!result.revalidating) await requestValidation(result.id, user.id);
      back(result.id, "saved=1&validating=1&publishing=1");
    }
    const published = await transitionProblem(result.id, "publish", user);
    back(
      result.id,
      published.ok ? "saved=1&done=publish" : `error=${encodeURIComponent(published.error)}`,
    );
  }
  back(
    result.id,
    `saved=1${result.movedToDraft ? "&draft=1" : ""}${result.revalidating ? "&validating=1" : ""}`,
  );
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
  refreshPublicPages();
  back(parsed.data.problemId, `solution=saved${result.revalidating ? "&validating=1" : ""}`);
}

export async function deleteSolutionAction(formData: FormData) {
  const user = await requirePermission("content.edit");
  const problemId = id.parse(formData.get("problemId"));
  const result = await deleteSolution(problemId, id.parse(formData.get("solutionId")), user);
  revalidatePath(`/admin/problems/${problemId}`);
  refreshPublicPages();
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
  refreshPublicPages();
  back(values.problemId, "test=added&validating=1");
}

export async function deleteTestCaseAction(formData: FormData) {
  const user = await requirePermission("content.edit");
  const problemId = id.parse(formData.get("problemId"));
  await deleteTestCase(problemId, id.parse(formData.get("testId")), user);
  revalidatePath(`/admin/problems/${problemId}`);
  refreshPublicPages();
  back(problemId, "test=deleted&validating=1");
}
