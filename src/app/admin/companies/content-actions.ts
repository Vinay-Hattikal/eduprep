"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { companyTabHref } from "@/lib/content/companies";
import { requirePermission } from "@/server/auth";
import { refreshPublicPages } from "@/server/services/public-pages";
import {
  linkItem,
  linkToCompany,
  setLinkRound,
  unlinkFromCompany,
  type LinkKind,
} from "@/server/services/company-links";

const id = z.string().min(1).max(40);
const kind = z.enum(["question", "problem", "design"]);
const slug = z.string().min(1).max(80);

const TAB: Record<LinkKind, string> = {
  question: "questions",
  problem: "coding",
  design: "interview",
};

function back(companySlug: string, itemKind: LinkKind, query: string) {
  revalidatePath(`/admin/companies/${companySlug}`);
  refreshPublicPages();
  redirect(`${companyTabHref(companySlug, TAB[itemKind])}${query}`);
}

/** Links an existing question, coding problem or interview question to the company. */
export async function linkItemAction(formData: FormData) {
  const user = await requirePermission("companies.manage");
  const companySlug = slug.parse(formData.get("slug"));
  const companyId = id.parse(formData.get("companyId"));
  const itemKind = kind.parse(formData.get("kind"));
  await linkToCompany(companyId, linkItem(itemKind, id.parse(formData.get("itemId"))), user);
  const q = String(formData.get("q") ?? "").slice(0, 100);
  back(companySlug, itemKind, `&linked=1${q ? `&q=${encodeURIComponent(q)}` : ""}`);
}

/** Removes the company link; the item itself stays. */
export async function unlinkItemAction(formData: FormData) {
  const user = await requirePermission("companies.manage");
  const companySlug = slug.parse(formData.get("slug"));
  const itemKind = kind.parse(formData.get("kind"));
  await unlinkFromCompany(id.parse(formData.get("linkId")), user);
  back(companySlug, itemKind, "&unlinked=1");
}

/** Which interview round an interview question belongs to (D-067). */
export async function setLinkRoundAction(formData: FormData) {
  const user = await requirePermission("companies.manage");
  const companySlug = slug.parse(formData.get("slug"));
  const round = String(formData.get("round") ?? "");
  const moved = await setLinkRound(
    id.parse(formData.get("linkId")),
    id.parse(formData.get("companyId")),
    round ? z.coerce.number().int().min(1).max(50).parse(round) : null,
    user,
  );
  back(
    companySlug,
    "design",
    moved ? "&round=1" : `&error=${encodeURIComponent("That round no longer exists.")}`,
  );
}
