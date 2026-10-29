import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import {
  MIN_INDEXABLE_TOPIC,
  PUBLIC_PAGE_SIZE,
  toPublicQuestion,
} from "@/lib/content/public-question";
import { db } from "@/server/db";

// Public question pages (D-058). Read through "use cache" with a tag; admin actions that publish
// or change questions call updateTag(PUBLIC_QUESTIONS_TAG). Imports run in the worker, so their
// changes show within the cache lifetime (an hour).

export const PUBLIC_QUESTIONS_TAG = "public-questions";

const QUESTION_FIELDS = {
  externalId: true,
  type: true,
  text: true,
  code: true,
  codeLanguage: true,
  options: true,
  difficulty: true,
  publicSample: true,
  correctOptions: true,
  numericAnswer: true,
  tolerance: true,
  explanation: true,
} as const;

const LIVE = { status: "PUBLISHED" } as const;

/** Subjects and topics that have published questions, with counts. */
export async function getPublicSubjects() {
  "use cache";
  cacheTag(PUBLIC_QUESTIONS_TAG);
  cacheLife("hours");

  const [subjects, counts] = await Promise.all([
    db.subject.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: {
        id: true,
        slug: true,
        name: true,
        topics: {
          orderBy: [{ order: "asc" }, { name: "asc" }],
          select: { id: true, slug: true, name: true },
        },
      },
    }),
    db.question.groupBy({ by: ["topicId"], where: LIVE, _count: { _all: true } }),
  ]);
  const byTopic = new Map(counts.map((c) => [c.topicId, c._count._all]));
  return subjects
    .map((s) => {
      const topics = s.topics
        .map((t) => ({ ...t, questions: byTopic.get(t.id) ?? 0 }))
        .filter((t) => t.questions > 0);
      return { ...s, topics, questions: topics.reduce((n, t) => n + t.questions, 0) };
    })
    .filter((s) => s.questions > 0);
}

/** One topic's page of questions, samples first. Null when the topic has none. */
export async function getPublicTopic(subjectSlug: string, topicSlug: string, page: number) {
  "use cache";
  cacheTag(PUBLIC_QUESTIONS_TAG);
  cacheLife("hours");

  const topic = await db.topic.findFirst({
    where: { slug: topicSlug, subject: { slug: subjectSlug } },
    select: {
      id: true,
      slug: true,
      name: true,
      subject: { select: { slug: true, name: true } },
      subtopics: { orderBy: { order: "asc" }, select: { name: true } },
    },
  });
  if (!topic) return null;
  const where = { ...LIVE, topicId: topic.id };
  const [total, samples, rows, companies] = await Promise.all([
    db.question.count({ where }),
    db.question.count({ where: { ...where, publicSample: true } }),
    db.question.findMany({
      where,
      orderBy: [{ publicSample: "desc" }, { difficulty: "asc" }, { externalId: "asc" }],
      skip: (page - 1) * PUBLIC_PAGE_SIZE,
      take: PUBLIC_PAGE_SIZE,
      select: { ...QUESTION_FIELDS, passage: { select: { title: true, body: true } } },
    }),
    db.company.findMany({
      where: { status: "PUBLISHED", items: { some: { question: where } } },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
  ]);
  if (!total) return null;
  return {
    topic,
    total,
    samples,
    pageCount: Math.max(1, Math.ceil(total / PUBLIC_PAGE_SIZE)),
    indexable: total >= MIN_INDEXABLE_TOPIC,
    questions: rows.map((q) => ({ ...toPublicQuestion(q), passage: q.passage })),
    companies,
  };
}

/** One published question by its ID (any case), with related questions. */
export async function getPublicQuestion(urlId: string) {
  "use cache";
  cacheTag(PUBLIC_QUESTIONS_TAG);
  cacheLife("hours");

  // IDs are upper-case by convention, so the exact match (unique index) almost always hits;
  // the case-insensitive scan only runs for an unusual ID.
  const exact = await db.question.findUnique({
    where: { externalId: urlId.toUpperCase() },
    select: { id: true },
  });
  const q = await db.question.findFirst({
    where: exact
      ? { ...LIVE, id: exact.id }
      : { ...LIVE, externalId: { equals: urlId, mode: "insensitive" } },
    select: {
      ...QUESTION_FIELDS,
      id: true,
      topicId: true,
      updatedAt: true,
      passage: { select: { title: true, body: true } },
      topic: { select: { slug: true, name: true } },
      subject: { select: { slug: true, name: true } },
      companies: {
        where: { company: { status: "PUBLISHED" } },
        select: { askedIn: true, company: { select: { slug: true, name: true } } },
      },
    },
  });
  if (!q) return null;
  const related = await db.question.findMany({
    where: { ...LIVE, topicId: q.topicId, id: { not: q.id } },
    orderBy: [{ publicSample: "desc" }, { externalId: "asc" }],
    take: 6,
    select: { externalId: true, text: true, publicSample: true },
  });
  return {
    question: { ...toPublicQuestion(q), passage: q.passage },
    topic: q.topic,
    subject: q.subject,
    companies: q.companies,
    updatedAt: q.updatedAt,
    related,
  };
}

// ---------- sitemaps ----------

export const SITEMAP_PAGE_SIZE = 40_000;

export async function publicQuestionSitemapPages() {
  const total = await db.question.count({ where: LIVE });
  return Math.max(1, Math.ceil(total / SITEMAP_PAGE_SIZE));
}

/** One sitemap file's worth of question and topic URLs. Topics go in the first file. */
export async function publicQuestionSitemap(page: number) {
  const [questions, topics] = await Promise.all([
    db.question.findMany({
      where: LIVE,
      orderBy: { externalId: "asc" },
      skip: page * SITEMAP_PAGE_SIZE,
      take: SITEMAP_PAGE_SIZE,
      select: { externalId: true, updatedAt: true },
    }),
    page === 0 ? getPublicSubjects() : Promise.resolve([]),
  ]);
  return { questions, subjects: topics };
}
