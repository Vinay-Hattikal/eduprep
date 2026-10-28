"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { contestFromData } from "@/schemas/contest";
import { requirePermission } from "@/server/auth";
import {
  copyContestToNextWeek,
  publishContest,
  saveContest,
  unpublishContest,
} from "@/server/services/contests";

export type ContestFormState = { fieldErrors?: Record<string, string>; formError?: string };

export async function saveContestAction(
  _prev: ContestFormState,
  formData: FormData,
): Promise<ContestFormState> {
  const user = await requirePermission("contests.manage");
  const parsed = contestFromData(formData);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues)
      fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { fieldErrors, formError: "Fix the highlighted fields." };
  }
  const result = await saveContest(parsed.data, user);
  if (!result.ok)
    return {
      fieldErrors: result.fieldErrors,
      formError: result.formError ?? "Fix the highlighted fields.",
    };
  revalidatePath("/admin/contests");
  redirect(`/admin/contests/${result.id}?saved=1`);
}

const statusAction = z.enum(["publish", "unpublish", "copy"]);

export async function contestStatusAction(formData: FormData) {
  const user = await requirePermission("contests.manage");
  const id = z.string().max(40).parse(formData.get("id"));
  const action = statusAction.parse(formData.get("action"));
  if (action === "copy") {
    const copy = await copyContestToNextWeek(id, user);
    revalidatePath("/admin/contests");
    redirect(
      copy.ok
        ? `/admin/contests/${copy.id}?copied=1`
        : `/admin/contests/${id}?error=${encodeURIComponent(copy.error)}`,
    );
  }
  const result =
    action === "publish" ? await publishContest(id, user) : await unpublishContest(id, user);
  revalidatePath("/admin/contests");
  revalidatePath("/contests");
  redirect(
    `/admin/contests/${id}${result.ok ? `?done=${action}` : `?error=${encodeURIComponent(result.error)}`}`,
  );
}
