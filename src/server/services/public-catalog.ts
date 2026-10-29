import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { toPublicProblem, type MockSection } from "@/lib/content/public-catalog";
import { db } from "@/server/db";

// Public coding problem and mock test pages (D-058, C.4). Cached with a tag; the admin problem
// and test actions refresh it. Changes from imports show within the hour.

export const PUBLIC_CATALOG_TAG = "public-catalog";
export const PROBLEMS_PAGE_SIZE = 30;

const LIVE = { status: "PUBLISHED" } as const;

/** Published coding problems, optionally for one DSA topic. */
export async function listPublicProblems(page: number, topicSlug?: string) {
  "use cache";
  cacheTag(PUBLIC_CATALOG_TAG);
  cacheLife("hours");

  const where = { ...LIVE, ...(topicSlug && { topics: { some: { slug: topicSlug } } }) };
  const [rows, total, topics] = await Promise.all([
    db.problem.findMany({
      where,
      orderBy: [{ difficulty: "asc" }, { title: "asc" }],
      skip: (page - 1) * PROBLEMS_PAGE_SIZE,
      take: PROBLEMS_PAGE_SIZE,
      select: {
        slug: true,
        title: true,
        difficulty: true,
        updatedAt: true,
        topics: { select: { slug: true, name: true } },
        companies: {
          where: { company: { status: "PUBLISHED" } },
          select: { company: { select: { name: true } } },
        },
      },
    }),
    db.problem.count({ where }),
    db.topic.findMany({
      where: { problems: { some: LIVE } },
      orderBy: { name: "asc" },
      select: { slug: true, name: true },
    }),
  ]);
  return {
    problems: rows,
    total,
    pageCount: Math.max(1, Math.ceil(total / PROBLEMS_PAGE_SIZE)),
    topics,
  };
}

/** One published problem: statement and sample tests only. */
export async function getPublicProblem(slug: string) {
  "use cache";
  cacheTag(PUBLIC_CATALOG_TAG);
  cacheLife("hours");

  const problem = await db.problem.findFirst({
    where: { ...LIVE, slug },
    select: {
      slug: true,
      title: true,
      difficulty: true,
      statement: true,
      inputFormat: true,
      outputFormat: true,
      constraints: true,
      timeLimitMs: true,
      memoryLimitMb: true,
      languages: true,
      updatedAt: true,
      // Only samples are read; hidden tests never leave the database here.
      testCases: {
        where: { isSample: true },
        orderBy: { order: "asc" },
        select: { isSample: true, input: true, output: true, explanation: true },
      },
      topics: { select: { slug: true, name: true } },
      companies: {
        where: { company: { status: "PUBLISHED" } },
        select: { askedIn: true, company: { select: { slug: true, name: true } } },
      },
    },
  });
  if (!problem) return null;
  return {
    problem: toPublicProblem(problem),
    topics: problem.topics,
    companies: problem.companies,
    updatedAt: problem.updatedAt,
  };
}

function sectionsOf(
  sections: {
    name: string;
    type: "MCQ" | "CODING";
    minutes: number;
    marksPerItem: number;
    negativeMarks: number;
    canGoBack: boolean;
    rules: { count: number; topic: { name: string } }[];
  }[],
): (MockSection & { topics: string[] })[] {
  return sections.map((s) => ({
    name: s.name,
    type: s.type,
    minutes: s.minutes,
    marksPerItem: s.marksPerItem,
    negativeMarks: s.negativeMarks,
    canGoBack: s.canGoBack,
    questions: s.rules.reduce((n, r) => n + r.count, 0),
    topics: [...new Set(s.rules.map((r) => r.topic.name))],
  }));
}

const SECTION_SELECT = {
  orderBy: { order: "asc" as const },
  select: {
    name: true,
    type: true,
    minutes: true,
    marksPerItem: true,
    negativeMarks: true,
    canGoBack: true,
    rules: { select: { count: true, topic: { select: { name: true } } } },
  },
};

/** Published mock tests: their format, never their questions. */
export async function listPublicMocks() {
  "use cache";
  cacheTag(PUBLIC_CATALOG_TAG);
  cacheLife("hours");

  const tests = await db.testBlueprint.findMany({
    where: LIVE,
    orderBy: [{ kind: "asc" }, { title: "asc" }],
    select: {
      slug: true,
      title: true,
      description: true,
      kind: true,
      platformStyle: true,
      updatedAt: true,
      company: { select: { slug: true, name: true, status: true } },
      sections: SECTION_SELECT,
    },
  });
  return tests.map(({ sections, company, ...t }) => ({
    ...t,
    company: company?.status === "PUBLISHED" ? company : null,
    sections: sectionsOf(sections),
  }));
}

export async function getPublicMock(slug: string) {
  "use cache";
  cacheTag(PUBLIC_CATALOG_TAG);
  cacheLife("hours");

  const test = await db.testBlueprint.findFirst({
    where: { ...LIVE, slug },
    select: {
      slug: true,
      title: true,
      description: true,
      instructions: true,
      kind: true,
      platformStyle: true,
      navigation: true,
      updatedAt: true,
      company: { select: { slug: true, name: true, status: true } },
      sections: SECTION_SELECT,
    },
  });
  if (!test) return null;
  const { sections, company, ...rest } = test;
  return {
    ...rest,
    company: company?.status === "PUBLISHED" ? company : null,
    sections: sectionsOf(sections),
  };
}
