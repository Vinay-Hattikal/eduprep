import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { toPublicQuestion } from "@/lib/content/public-question";
import { db } from "@/server/db";

/** Cache tag for everything shown on public company pages. Admin actions call updateTag(). */
export const COMPANIES_TAG = "companies";

/** Published companies for the directory, onboarding and sitemap. Cached across requests. */
export async function getPublishedCompanies() {
  "use cache";
  cacheTag(COMPANIES_TAG);
  cacheLife("hours");

  return db.company.findMany({
    where: { status: "PUBLISHED" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      level: true,
      category: true,
      hiringFor: true,
      ctcFresher: true,
      ctcExperienced: true,
      lastVerifiedAt: true,
      updatedAt: true,
      _count: {
        select: {
          rounds: true,
          items: { where: { question: { status: "PUBLISHED" } } },
          experiences: { where: { status: "APPROVED" } },
        },
      },
    },
  });
}

/** Everything on one public company page, or null if it isn't published. */
export async function getPublishedCompany(slug: string) {
  "use cache";
  cacheTag(COMPANIES_TAG, `company:${slug}`);
  cacheLife("hours");
  return loadCompanyPage(slug, true);
}

/**
 * The public page of a company that isn't published yet, for admins checking it before they
 * publish (D-067). Not cached; shows the content that is already live.
 */
export async function getCompanyPreview(slug: string) {
  return loadCompanyPage(slug, false);
}

async function loadCompanyPage(slug: string, publishedOnly: boolean) {
  const company = await db.company.findFirst({
    where: { slug, ...(publishedOnly ? { status: "PUBLISHED" } : { status: { not: "ARCHIVED" } }) },
    include: {
      rounds: {
        orderBy: { order: "asc" },
        include: {
          sections: {
            orderBy: { order: "asc" },
            include: {
              topics: { select: { slug: true, name: true, subject: { select: { slug: true } } } },
            },
          },
        },
      },
      sources: { orderBy: { checkedOn: "desc" } },
    },
  });
  if (!company) return null;

  const [reported, questionCount, problems, samples, mocks] = await Promise.all([
    db.companyItem.findMany({
      where: {
        companyId: company.id,
        question: { status: "PUBLISHED" },
        askedIn: { isEmpty: false },
      },
      orderBy: [{ reportCount: "desc" }],
      take: 6,
      select: {
        askedIn: true,
        question: { select: { externalId: true, text: true, topic: { select: { name: true } } } },
      },
    }),
    db.companyItem.count({ where: { companyId: company.id, question: { status: "PUBLISHED" } } }),
    db.companyItem.findMany({
      where: { companyId: company.id, problem: { status: "PUBLISHED" } },
      orderBy: [{ reportCount: "desc" }],
      take: 8,
      select: {
        askedIn: true,
        problem: { select: { slug: true, title: true, difficulty: true } },
      },
    }),
    // Public sample questions this company asks, shown with answers (D-058, C.5).
    db.question.findMany({
      where: {
        status: "PUBLISHED",
        publicSample: true,
        companies: { some: { companyId: company.id } },
      },
      orderBy: { externalId: "asc" },
      take: 5,
      select: {
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
        passage: { select: { title: true, body: true } },
        topic: { select: { slug: true, subject: { select: { slug: true } } } },
      },
    }),
    db.testBlueprint.findMany({
      where: { companyId: company.id, status: "PUBLISHED" },
      orderBy: { title: "asc" },
      select: { slug: true, title: true, kind: true },
    }),
  ]);
  // The filters above guarantee the relation is present; narrow the types to match.
  const recentQuestions = reported.flatMap(({ question, ...item }) =>
    question ? [{ ...item, question }] : [],
  );
  const codingProblems = problems.flatMap(({ problem, ...item }) =>
    problem ? [{ ...item, problem }] : [],
  );

  const sampleQuestions = samples.map(({ passage, topic, ...q }) => ({
    ...toPublicQuestion(q),
    passage,
    topic,
  }));

  return { ...company, recentQuestions, questionCount, codingProblems, sampleQuestions, mocks };
}
