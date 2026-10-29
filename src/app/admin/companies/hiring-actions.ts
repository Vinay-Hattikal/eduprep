"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  fieldErrors,
  roundFormFromData,
  sectionFormFromData,
  sourceFormSchema,
} from "@/schemas/admin-content";
import { requirePermission } from "@/server/auth";
import { refreshPublicPages } from "@/server/services/public-pages";
import {
  addSource,
  deleteRound,
  deleteSection,
  deleteSource,
  moveRound,
  moveSection,
  saveRound,
  saveSection,
} from "@/server/services/company-hiring";

export type HiringFormState = { fieldErrors?: Record<string, string>; formError?: string };

const id = z.string().min(1).max(40);
const direction = z.enum(["up", "down"]);

/** Refreshes the admin and public pages, then returns to the right tab. */
function done(slug: string, tab: "process" | "sources", query = "") {
  revalidatePath(`/admin/companies/${slug}`);
  refreshPublicPages();
  redirect(`/admin/companies/${slug}?tab=${tab}${query ? `&${query}` : ""}`);
}

function fail(result: { error: string; field?: string }): HiringFormState {
  return result.field
    ? { fieldErrors: { [result.field]: result.error }, formError: result.error }
    : { formError: result.error };
}

export async function saveRoundAction(
  _prev: HiringFormState,
  formData: FormData,
): Promise<HiringFormState> {
  const user = await requirePermission("companies.manage");
  const parsed = roundFormFromData(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), formError: "Fix the highlighted fields." };
  const result = await saveRound(parsed.data, user);
  if (!result.ok) return fail(result);
  done(result.slug, "process", "saved=round");
  return {};
}

export async function saveSectionAction(
  _prev: HiringFormState,
  formData: FormData,
): Promise<HiringFormState> {
  const user = await requirePermission("companies.manage");
  const parsed = sectionFormFromData(formData);
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), formError: "Fix the highlighted fields." };
  const result = await saveSection(parsed.data, user);
  if (!result.ok) return fail(result);
  done(result.slug, "process", "saved=section");
  return {};
}

export async function addSourceAction(
  _prev: HiringFormState,
  formData: FormData,
): Promise<HiringFormState> {
  const user = await requirePermission("companies.manage");
  const parsed = sourceFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success)
    return { fieldErrors: fieldErrors(parsed.error), formError: "Fix the highlighted fields." };
  const result = await addSource(parsed.data, user);
  if (!result.ok) return fail(result);
  done(result.slug, "sources", "saved=source");
  return {};
}

/** Delete or move buttons: one action, the button says which. */
export async function hiringChangeAction(formData: FormData) {
  const user = await requirePermission("companies.manage");
  const slug = z.string().min(1).max(80).parse(formData.get("slug"));
  const op = z
    .enum([
      "round-delete",
      "round-up",
      "round-down",
      "section-delete",
      "section-up",
      "section-down",
      "source-delete",
    ])
    .parse(formData.get("op"));
  const target = id.parse(formData.get("id"));
  const [level, verb] = op.split("-") as ["round" | "section" | "source", string];
  const result =
    level === "round"
      ? verb === "delete"
        ? await deleteRound(target, user)
        : await moveRound(target, direction.parse(verb), user)
      : level === "section"
        ? verb === "delete"
          ? await deleteSection(target, user)
          : await moveSection(target, direction.parse(verb), user)
        : await deleteSource(target, user);
  const tab = level === "source" ? "sources" : "process";
  if (!result.ok) done(slug, tab, `error=${encodeURIComponent(result.error)}`);
  done(result.ok ? result.slug : slug, tab);
}
