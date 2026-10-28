"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { startContestSitting } from "@/server/services/contests";

export async function startContestAction(formData: FormData) {
  const user = await requirePermission("student.access");
  const slug = z.string().min(1).max(120).parse(formData.get("slug"));
  const result = await startContestSitting(user, slug);
  if (result.status === "started") redirect(`/exam/${result.sittingId}`);
  if (result.status === "finished") redirect(`/tests/results/${result.sittingId}`);
  if (result.status === "not-open")
    redirect(`/contests/${slug}?error=${encodeURIComponent(result.message)}`);
  redirect("/contests");
}
