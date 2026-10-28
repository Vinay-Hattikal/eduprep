import "server-only";

import type { InterviewAudience } from "@/generated/prisma/enums";
import type { Actor } from "@/lib/content/workflow";
import { db } from "@/server/db";
import { recordAudit } from "@/server/services/audit";

// Role tracks are guidance pages (topics, roadmap, interview types) rather than graded content,
// so, like their import, edits go live straight away (no review step). Hiding a track takes
// it off the student pages without losing it.

export type TrackValues = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  roadmap: string;
  audience: InterviewAudience;
  order: number;
  topicIds: string[];
  interviewTypes: string[];
};

export type TrackSaveResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

export async function listAdminTracks() {
  return db.roleTrack.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { topics: true } } },
  });
}

export async function getAdminTrack(id: string) {
  return db.roleTrack.findUnique({
    where: { id },
    include: { topics: { select: { id: true } } },
  });
}

/** Every topic grouped by subject, and every interview type, for the track form. */
export async function trackFormOptions() {
  const [subjects, interviewTypes] = await Promise.all([
    db.subject.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        name: true,
        topics: { orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true } },
      },
    }),
    db.interviewType.findMany({ orderBy: { order: "asc" }, select: { slug: true, name: true } }),
  ]);
  return { subjects: subjects.filter((s) => s.topics.length), interviewTypes };
}

export async function saveTrack(values: TrackValues, actor: Actor): Promise<TrackSaveResult> {
  const topicIds = [...new Set(values.topicIds)];
  const [before, sameSlug, topics, types] = await Promise.all([
    values.id
      ? db.roleTrack.findUnique({ where: { id: values.id }, select: { id: true, slug: true } })
      : null,
    db.roleTrack.findUnique({ where: { slug: values.slug }, select: { id: true } }),
    db.topic.count({ where: { id: { in: topicIds } } }),
    db.interviewType.count({ where: { slug: { in: values.interviewTypes } } }),
  ]);
  if (values.id && !before)
    return { ok: false, fieldErrors: {}, formError: "This track no longer exists." };
  const fieldErrors: Record<string, string> = {};
  // Design questions point at tracks by slug, so it stays fixed once created.
  if (before && before.slug !== values.slug) fieldErrors.slug = "The slug can't be changed.";
  else if (sameSlug && sameSlug.id !== values.id)
    fieldErrors.slug = "This URL slug is already used.";
  if (topics !== topicIds.length) fieldErrors.topicIds = "Unknown topic.";
  if (types !== new Set(values.interviewTypes).size)
    fieldErrors.interviewTypes = "Unknown interview type.";
  if (Object.keys(fieldErrors).length)
    return { ok: false, fieldErrors, formError: "Fix the highlighted fields." };

  const { id: _id, topicIds: _topics, ...data } = values;
  const connect = topicIds.map((id) => ({ id }));
  const track = await db.$transaction(async (tx) => {
    const saved = before
      ? await tx.roleTrack.update({
          where: { id: before.id },
          data: { ...data, topics: { set: connect } },
        })
      : await tx.roleTrack.create({
          data: { ...data, status: "PUBLISHED", topics: { connect } },
        });
    await recordAudit(
      {
        actorId: actor.id,
        action: before ? "track.update" : "track.create",
        entityType: "role_track",
        entityId: saved.id,
        after: { slug: saved.slug },
      },
      tx,
    );
    return saved;
  });
  return { ok: true, id: track.id, created: !before };
}

/** Shows (published) or hides (draft) a track on the student pages. */
export async function setTrackVisible(id: string, visible: boolean, actor: Actor) {
  const status = visible ? "PUBLISHED" : "DRAFT";
  await db.$transaction(async (tx) => {
    const { count } = await tx.roleTrack.updateMany({ where: { id }, data: { status } });
    if (!count) return;
    await recordAudit(
      {
        actorId: actor.id,
        action: visible ? "track.show" : "track.hide",
        entityType: "role_track",
        entityId: id,
      },
      tx,
    );
  });
}
