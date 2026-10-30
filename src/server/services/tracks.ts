import "server-only";

import type { DesignKind } from "@/generated/prisma/enums";
import { isAdmin } from "@/lib/permissions";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { COMPANY_SLUGS, companySlugs } from "@/server/services/company-links";
import { listInterviewTypes } from "@/server/services/interview-types";

type Viewer = Pick<CurrentUser, "id" | "roles">;

export async function listTracks() {
  return db.roleTrack.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ order: "asc" }, { name: "asc" }],
    include: { _count: { select: { topics: true } } },
  });
}

/** A role track: its topics with the student's mastery, coding problems, design questions, interviews. */
export async function getTrack(user: Viewer, slug: string) {
  const track = await db.roleTrack.findFirst({
    where: { slug, ...(isAdmin(user.roles) ? {} : { status: "PUBLISHED" }) },
    include: {
      topics: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          subject: { select: { name: true, slug: true } },
          _count: {
            select: {
              questions: { where: { status: "PUBLISHED" } },
              problems: { where: { status: "PUBLISHED" } },
            },
          },
        },
      },
    },
  });
  if (!track) return null;
  const topicIds = track.topics.map((t) => t.id);
  const [mastery, problems, design, types] = await Promise.all([
    db.mastery.findMany({ where: { userId: user.id, topicId: { in: topicIds } } }),
    db.problem.findMany({
      where: { status: "PUBLISHED", topics: { some: { id: { in: topicIds } } } },
      orderBy: [{ difficulty: "asc" }, { title: "asc" }],
      take: 12,
      select: {
        slug: true,
        title: true,
        difficulty: true,
        progress: { where: { userId: user.id }, select: { solvedAt: true } },
      },
    }),
    db.designQuestion.findMany({
      where: { status: "PUBLISHED", tracks: { has: track.slug } },
      orderBy: [{ difficulty: "asc" }, { title: "asc" }],
      select: { slug: true, title: true, kind: true, difficulty: true },
    }),
    listInterviewTypes(),
  ]);
  return {
    track,
    topics: track.topics.map((t) => {
      const m = mastery.find((x) => x.topicId === t.id);
      return { ...t, mastery: m?.score ?? 0, attempts: m?.attempts ?? 0 };
    }),
    problems: problems.map(({ progress, ...p }) => ({
      ...p,
      solved: Boolean(progress[0]?.solvedAt),
    })),
    design,
    interviewTypes: types.filter((t) => track.interviewTypes.includes(t.slug)),
  };
}

export async function listDesignQuestions(
  user: Viewer,
  filter: { kind?: DesignKind; track?: string; company?: string },
) {
  const questions = await db.designQuestion.findMany({
    where: {
      ...(isAdmin(user.roles) ? {} : { status: "PUBLISHED" }),
      ...(filter.kind && { kind: filter.kind }),
      ...(filter.track && { tracks: { has: filter.track } }),
      ...(filter.company && { companies: { some: { company: { slug: filter.company } } } }),
    },
    orderBy: [{ kind: "asc" }, { difficulty: "asc" }, { title: "asc" }],
    select: {
      slug: true,
      title: true,
      kind: true,
      difficulty: true,
      companies: COMPANY_SLUGS,
      tracks: true,
    },
  });
  return questions.map((q) => ({ ...q, companies: companySlugs(q.companies) }));
}

export async function getDesignQuestion(user: Viewer, slug: string) {
  const question = await db.designQuestion.findFirst({
    where: { slug, ...(isAdmin(user.roles) ? {} : { status: "PUBLISHED" }) },
    include: {
      companies: {
        where: { company: { status: "PUBLISHED" } },
        select: { company: { select: { name: true, slug: true } } },
      },
    },
  });
  if (!question) return null;
  const { companies, ...rest } = question;
  return { ...rest, companyRefs: companies.map((c) => c.company) };
}
