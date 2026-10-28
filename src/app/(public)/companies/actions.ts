"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { can } from "@/lib/permissions";
import { MAX_TARGETS } from "@/schemas/onboarding";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { requestCompany } from "@/server/services/reports";

export type RequestState = { ok?: boolean; error?: string };

export async function requestCompanyAction(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const user = await getCurrentUser();
  if (!user || !can(user.roles, "student.access"))
    return { error: "Sign in to request a company." };
  const name = z
    .string()
    .trim()
    .min(2, "Enter the company name.")
    .max(100)
    .safeParse(formData.get("companyName"));
  if (!name.success) return { error: name.error.issues[0]?.message };
  await requestCompany(user.id, name.data);
  return { ok: true };
}

/** "Prepare for this company": adds it to the student's targets (PRD 4.7). */
export async function addTargetAction(
  companyId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getCurrentUser();
  if (!user || !can(user.roles, "student.access")) return { ok: false, error: "Sign in first." };

  const company = await db.company.findFirst({
    where: { id: companyId, status: "PUBLISHED" },
    select: { slug: true },
  });
  if (!company) return { ok: false, error: "This company isn't available." };
  const existing = await db.targetCompany.findMany({
    where: { userId: user.id },
    select: { companyId: true },
  });
  if (existing.some((t) => t.companyId === companyId)) return { ok: true };
  if (existing.length >= MAX_TARGETS) {
    return {
      ok: false,
      error: `You already have ${MAX_TARGETS} target companies. Remove one in Edit goals.`,
    };
  }
  await db.targetCompany.create({ data: { userId: user.id, companyId } });
  revalidatePath(`/companies/${company.slug}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
