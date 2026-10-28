import "server-only";

import type { RubricItem } from "@/lib/interviews/policies";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";
import { getSetting } from "@/server/services/settings";
import { INTERVIEW_PRICE_KEYS, isSettingKey, SETTINGS } from "@/server/services/settings/registry";

export type InterviewTypeView = {
  id: string;
  slug: string;
  name: string;
  description: string;
  audience: "FRESHER" | "EXPERIENCED" | "BOTH";
  durationMin: number;
  pricePaise: number;
  rubric: RubricItem[];
  active: boolean;
};

/** A type's price comes from its setting (admin › Settings), never from the client. */
export async function typePrice(priceSetting: string): Promise<number> {
  if (!isSettingKey(priceSetting)) throw new Error(`Unknown price setting ${priceSetting}`);
  return getSetting(priceSetting);
}

export async function listInterviewTypes({ includeInactive = false } = {}): Promise<
  InterviewTypeView[]
> {
  const types = await db.interviewType.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { order: "asc" },
  });
  return Promise.all(
    types.map(async (t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      description: t.description,
      audience: t.audience,
      durationMin: t.durationMin,
      pricePaise: await typePrice(t.priceSetting),
      rubric: t.rubric as RubricItem[],
      active: t.active,
    })),
  );
}

export async function getInterviewType(idOrSlug: string): Promise<InterviewTypeView | null> {
  const types = await listInterviewTypes({ includeInactive: true });
  return types.find((t) => t.id === idOrSlug || t.slug === idOrSlug) ?? null;
}

// ---------- Admin editing ----------

export type InterviewTypeValues = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  audience: "FRESHER" | "EXPERIENCED" | "BOTH";
  durationMin: number;
  priceSetting: string;
  order: number;
  active: boolean;
  rubric: RubricItem[];
};

export type InterviewTypeSaveResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

/** Interview types with how many bookings and interviewers use each (admin list). */
export async function listAdminInterviewTypes() {
  const types = await db.interviewType.findMany({
    orderBy: { order: "asc" },
    include: { _count: { select: { bookings: true, interviewers: true } } },
  });
  return Promise.all(
    types.map(async (t) => ({ ...t, pricePaise: await typePrice(t.priceSetting) })),
  );
}

/**
 * Creates or edits an interview type. The slug is fixed once created (role tracks and booking
 * links use it). Rubric items keep their keys, so old scorecards still show under the right
 * heading; scorecards for items that were removed keep their scores (D-055).
 */
export async function saveInterviewType(
  values: InterviewTypeValues,
  actor: { id: string },
): Promise<InterviewTypeSaveResult> {
  const fieldErrors: Record<string, string> = {};
  if (!(INTERVIEW_PRICE_KEYS as readonly string[]).includes(values.priceSetting))
    fieldErrors.priceSetting = "Choose one of the interview prices.";
  const [before, sameSlug] = await Promise.all([
    values.id
      ? db.interviewType.findUnique({ where: { id: values.id }, select: { id: true, slug: true } })
      : null,
    db.interviewType.findUnique({ where: { slug: values.slug }, select: { id: true } }),
  ]);
  if (values.id && !before)
    return { ok: false, fieldErrors: {}, formError: "This interview type no longer exists." };
  if (before && before.slug !== values.slug) fieldErrors.slug = "The slug can't be changed.";
  else if (sameSlug && sameSlug.id !== values.id)
    fieldErrors.slug = "This URL slug is already used.";
  if (Object.keys(fieldErrors).length)
    return { ok: false, fieldErrors, formError: "Fix the highlighted fields." };

  const { id: _id, ...data } = values;
  const saved = await db.$transaction(async (tx) => {
    const type = before
      ? await tx.interviewType.update({ where: { id: before.id }, data })
      : await tx.interviewType.create({ data });
    await recordAudit(
      {
        actorId: actor.id,
        action: before ? "interview_type.update" : "interview_type.create",
        entityType: "interview_type",
        entityId: type.id,
        after: { slug: type.slug, active: type.active, priceSetting: type.priceSetting },
      },
      tx,
    );
    return type;
  });
  return { ok: true, id: saved.id, created: !before };
}

/** The interview prices a type can use, with their current amounts. */
export async function interviewPriceOptions() {
  return Promise.all(
    INTERVIEW_PRICE_KEYS.map(async (key) => ({
      key,
      label: SETTINGS[key].label,
      pricePaise: await getSetting(key),
    })),
  );
}
