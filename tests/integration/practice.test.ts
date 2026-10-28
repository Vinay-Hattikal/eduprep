import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { istDay } from "@/lib/learning/dates";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { getReportUpdates, getStudentStats, getTargetReadiness } from "@/server/services/learning";
import { saveOnboarding } from "@/server/services/onboarding";
import {
  getDailyQuestionId,
  nextQuestion,
  practiceUsage,
  reportError,
  submitAnswer,
  toggleBookmark,
} from "@/server/services/practice";
import { transitionQuestion } from "@/server/services/questions";
import { resolveReport } from "@/server/services/reports";
import { setCompanyStatus } from "@/server/services/companies";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let student: CurrentUser;
let adminId: string;

async function publishAll() {
  const actor = { id: adminId, roles: ["ADMIN" as const] };
  for (const q of await db.question.findMany({ where: { status: "DRAFT" } })) {
    await transitionQuestion(q.id, "publish", actor);
  }
}

async function answer(
  externalId: string,
  choice: { options?: string[]; numeric?: number },
  mode: "PRACTICE" | "RETRY" | "DAILY" = "PRACTICE",
) {
  const q = await db.question.findUniqueOrThrow({ where: { externalId } });
  return submitAnswer(student, {
    questionId: q.id,
    selectedOptions: choice.options ?? [],
    numericAnswer: choice.numeric ?? null,
    timeSec: 30,
    mode,
  });
}

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["ADMIN"], "admin@test.example")).id;
  for (const [type, file] of [
    ["TAXONOMY", "taxonomy.csv"],
    ["PASSAGES", "passages.csv"],
    // Companies first: question files tag questions with companies (D-054 import order).
    ["COMPANIES", "companies/companies.csv"],
    ["COMPANY_ROUNDS", "companies/company-rounds.csv"],
    ["COMPANY_SECTIONS", "companies/company-sections.csv"],
    ["COMPANY_SOURCES", "companies/company-sources.csv"],
    ["MCQ", "mcq/quantitative-aptitude.csv"],
    ["MCQ", "mcq/logical-reasoning.csv"],
    ["COMPANY_QUESTION_MAP", "companies/company-question-map.csv"],
  ] as const) {
    await importFile(type, file, await template(file), adminId);
  }
  await publishAll();
  const admin = await db.user.findUniqueOrThrow({ where: { id: adminId } });
  const company = await db.company.findUniqueOrThrow({ where: { slug: "acme-tech" } });
  await setCompanyStatus(company.id, "publish", admin);
});

beforeEach(async () => {
  for (const table of [
    "attempt",
    "mastery",
    "mistake",
    "bookmark",
    "userStats",
    "errorReport",
    "targetCompany",
    "setting",
  ] as const) {
    await (db[table] as unknown as { deleteMany: () => Promise<unknown> }).deleteMany();
  }
  const user = await db.user.upsert({
    where: { email: "student@test.example" },
    create: {
      name: "Test Student",
      email: "student@test.example",
      roles: ["STUDENT"],
      onboardedAt: new Date(),
    },
    update: {},
  });
  student = {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: ["STUDENT"],
    profileType: "FRESHER",
    onboarded: true,
  };
});

describe("choosing questions", () => {
  it("serves unattempted questions first, easy to hard, and never leaks answers", async () => {
    const first = await nextQuestion(student.id, { topic: "percentages", source: "all" }, []);
    expect(first?.externalId).toBe("QA-PCT-0001");
    expect(first).not.toHaveProperty("correctOptions");
    expect(first).not.toHaveProperty("explanation");
    expect(first).not.toHaveProperty("numericAnswer");
    expect(first?.askedIn[0]).toMatchObject({
      company: expect.stringMatching(/Acme/),
      months: ["2026-08", "2025-09"],
    });

    const subject = await nextQuestion(
      student.id,
      { subject: "quantitative-aptitude", source: "all" },
      [first!.id],
    );
    expect(subject?.externalId).not.toBe("QA-PCT-0001");
  });

  it("filters by company, mistakes and bookmarks", async () => {
    const company = await nextQuestion(student.id, { company: "acme-tech", source: "all" }, []);
    expect(["QA-PCT-0001", "LR-BR-0001"]).toContain(company?.externalId);

    expect(await nextQuestion(student.id, { source: "mistakes" }, [])).toBeNull();
    await answer("LR-BR-0001", { options: ["C"] });
    expect((await nextQuestion(student.id, { source: "mistakes" }, []))?.externalId).toBe(
      "LR-BR-0001",
    );

    const q = await db.question.findUniqueOrThrow({ where: { externalId: "QA-TW-0001" } });
    expect(await toggleBookmark(student.id, q.id)).toBe(true);
    expect((await nextQuestion(student.id, { source: "bookmarks" }, []))?.externalId).toBe(
      "QA-TW-0001",
    );
    expect(await toggleBookmark(student.id, q.id)).toBe(false);
  });
});

describe("answering", () => {
  it("records the attempt, updates mastery and starts a streak", async () => {
    const result = await answer("QA-PCT-0001", { options: ["B"] });
    expect(result).toMatchObject({
      status: "answered",
      correct: true,
      correctOptions: ["B"],
      mastery: { before: 0, after: 33 },
      usage: { used: 1, limit: 25 },
    });
    const stats = await getStudentStats(student.id);
    expect(stats).toMatchObject({
      attempts: 1,
      correct: 1,
      streak: 1,
      practisedToday: true,
      todayCount: 1,
    });
  });

  it("grades numeric answers and keeps mistakes until answered correctly", async () => {
    expect(await answer("QA-AVG-0001", { numeric: 25 })).toMatchObject({
      correct: false,
      numericAnswer: 26,
    });
    expect((await getStudentStats(student.id)).openMistakes).toBe(1);
    expect(await answer("QA-AVG-0001", { numeric: 26 }, "RETRY")).toMatchObject({ correct: true });
    expect((await getStudentStats(student.id)).openMistakes).toBe(0);
  });

  it("enforces the free daily limit on the server, but not for the daily question", async () => {
    await db.setting.create({ data: { key: "limits.freeMcqPerDay", value: 2 } });
    await answer("QA-PCT-0001", { options: ["B"] });
    await answer("QA-AVG-0001", { numeric: 26 });
    expect(await answer("QA-TW-0001", { options: ["B"] })).toEqual({
      status: "limit",
      usage: { used: 2, limit: 2 },
    });
    expect(await answer("QA-TW-0001", { options: ["B"] }, "DAILY")).toMatchObject({
      status: "answered",
    });
    expect(await practiceUsage(student)).toEqual({ used: 2, limit: 2 });

    // Admins previewing the student app aren't limited.
    expect((await practiceUsage({ id: adminId, roles: ["ADMIN"] })).limit).toBeNull();
  });

  it("rejects unpublished questions", async () => {
    const q = await db.question.findUniqueOrThrow({ where: { externalId: "LR-NS-0001" } });
    await transitionQuestion(q.id, "archive", { id: adminId, roles: ["ADMIN"] });
    expect(await answer("LR-NS-0001", { numeric: 42 })).toEqual({ status: "not-found" });
    expect(
      await nextQuestion(student.id, { topic: "number-series", source: "all" }, []),
    ).toBeNull();
  });
});

describe("question of the day", () => {
  it("picks one published question per day and keeps it", async () => {
    const first = await getDailyQuestionId();
    expect(first).toBeTruthy();
    expect(await getDailyQuestionId()).toBe(first);
    const stored = await db.dailyQuestion.findUniqueOrThrow({ where: { date: istDay() } });
    expect(stored.questionId).toBe(first);
  });
});

describe("readiness and onboarding", () => {
  it("saves the profile, keeps only published target companies, and measures readiness", async () => {
    const company = await db.company.findUniqueOrThrow({ where: { slug: "acme-tech" } });
    await saveOnboarding(student.id, {
      profileType: "FRESHER",
      name: "Test Student",
      preferredLanguage: "python",
      college: "Example Institute",
      degree: "B.Tech",
      branch: "CSE",
      gradYear: 2027,
      cgpaBand: "7.0–7.9",
      hasBacklogs: false,
      targets: [
        { companyId: company.id, targetDate: null },
        { companyId: "not-a-real-company", targetDate: null },
      ],
    });
    expect(await db.targetCompany.count({ where: { userId: student.id } })).toBe(1);
    expect(await db.fresherProfile.findUnique({ where: { userId: student.id } })).toMatchObject({
      branch: "CSE",
    });

    const [before] = await getTargetReadiness(student.id);
    expect(before).toMatchObject({ slug: "acme-tech", score: 0 });
    expect(before!.focus.length).toBeGreaterThan(0);

    await answer("QA-PCT-0001", { options: ["B"] });
    const [after] = await getTargetReadiness(student.id);
    expect(after!.score).toBeGreaterThan(0);
  });
});

describe("error reports", () => {
  it("lets a student report a question and see the admin's reply", async () => {
    const q = await db.question.findUniqueOrThrow({ where: { externalId: "QA-PCT-0001" } });
    expect(
      await reportError(student.id, {
        questionId: q.id,
        reason: "TYPO",
        message: "Option C has a typo",
      }),
    ).toEqual({ ok: true });
    const report = await db.errorReport.findFirstOrThrow({ where: { userId: student.id } });

    expect(await resolveReport(report.id, "FIXED", "Thanks, fixed the typo.", adminId)).toEqual({
      ok: true,
    });
    expect(await resolveReport(report.id, "FIXED", "Again", adminId)).toMatchObject({ ok: false });
    expect(await getReportUpdates(student.id)).toEqual([
      expect.objectContaining({ status: "FIXED", reply: "Thanks, fixed the typo." }),
    ]);
  });
});
