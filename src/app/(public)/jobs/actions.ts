"use server";

import { z } from "zod";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { toggleSaveJob } from "@/server/services/job-postings";

export async function toggleSaveJobAction(
  jobId: string,
): Promise<{ ok: true; saved: boolean } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user.roles, "student.access"))
    return { ok: false, error: "Sign in to save jobs." };
  const id = z.string().min(1).max(40).safeParse(jobId);
  if (!id.success) return { ok: false, error: "Not found." };
  return { ok: true, saved: await toggleSaveJob(user.id, id.data) };
}
