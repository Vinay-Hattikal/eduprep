// Load test (6.10, D-065): many students sitting a mock test at once, and judge throughput.
// Runs the real services against the disposable *_test database, with no browser or HTTP in
// between: it measures the database and server code, which is what saturates first. Network
// and rendering add to these numbers in production.
//
//   npm run test:load                          200 students, 40 judge submissions
//   LOAD_STUDENTS=500 LOAD_JUDGE=80 npm run test:load
//   LOAD_BASE_URL=http://localhost:3000 npm run test:load   also hits public pages over HTTP
//
// The results print as a table; record them in docs/progress.md when they change.

import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { drainJobs } from "@/server/jobs/runner";
import { saveBlueprint, transitionBlueprint } from "@/server/services/blueprints";
import { createSubmission, judgeSubmission } from "@/server/services/coding";
import { transitionProblem } from "@/server/services/problems";
import {
  advanceSection,
  getRunnerView,
  saveItem,
  startSitting,
  submitSitting,
} from "@/server/services/tests";
import { createUser, importFile, resetDatabase, template } from "../integration/helpers";

const STUDENTS = Number(process.env.LOAD_STUDENTS) || 200;
const JUDGE_SUBMISSIONS = Number(process.env.LOAD_JUDGE) || 40;
const QUESTIONS = 20;

/**
 * p95 budgets, as regression guards. Every student acts in the same instant here (the worst
 * case: a contest's start and end), and the students, Prisma and PostgreSQL share one laptop's
 * CPU, so a bigger connection pool barely moves these. Measured 2026-10-29 with 200 students:
 * start 2.2 s, view 0.7 s, save 0.4 s, advance 0.1 s (1.4 s outliers), submit 2.6 s.
 */
const BUDGET_P95_MS = { start: 3_000, view: 1_000, save: 750, advance: 2_000, submit: 3_500 };

// ---------- measuring ----------

const timings = new Map<string, number[]>();
let failures: string[] = [];

async function timed<T>(op: string, fn: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await fn();
  } finally {
    const list = timings.get(op) ?? [];
    list.push(performance.now() - started);
    timings.set(op, list);
  }
}

function percentile(sorted: number[], p: number) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

function report(title: string, seconds: number) {
  const rows = [...timings].map(([op, list]) => {
    const sorted = [...list].sort((a, b) => a - b);
    return {
      op,
      calls: list.length,
      "per sec": Math.round(list.length / seconds),
      "p50 ms": Math.round(percentile(sorted, 50)),
      "p95 ms": Math.round(percentile(sorted, 95)),
      "p99 ms": Math.round(percentile(sorted, 99)),
    };
  });
  console.log(`\n${title}: ${seconds.toFixed(1)} s`);
  console.table(rows);
  return new Map(rows.map((r) => [r.op, r]));
}

/** Runs `fn` over `items`, at most `limit` at a time. */
async function pool<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<unknown>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]!);
    }),
  );
}

// ---------- setup ----------

let adminId: string;
let problemId: string;
/** The problem's reference solution, from the imported template. */
let python: string;
let students: CurrentUser[] = [];

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["ADMIN"], "admin@load.example")).id;
  const admin = { id: adminId, roles: ["ADMIN" as const] };
  await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), adminId);
  for (const [type, file] of [
    ["CODING_PROBLEMS", "coding/coding-problems.csv"],
    ["CODING_TESTCASES", "coding/coding-testcases.csv"],
    ["CODING_SOLUTIONS", "coding/coding-solutions.csv"],
  ] as const)
    await importFile(type, file, await template(file), adminId);
  await drainJobs();
  const problem = await db.problem.findUniqueOrThrow({ where: { externalId: "CODE-ARR-0001" } });
  await transitionProblem(problem.id, "publish", admin);
  problemId = problem.id;
  python = (
    await db.problemSolution.findUniqueOrThrow({
      where: { problemId_kind_language: { problemId, kind: "REFERENCE", language: "python" } },
    })
  ).code;

  // A pool of published questions, so each student draws a different set.
  const topic = await db.topic.findUniqueOrThrow({ where: { slug: "percentages" } });
  await db.question.createMany({
    data: Array.from({ length: QUESTIONS * 5 }, (_, i) => ({
      externalId: `QA-LOAD-${i}`,
      subjectId: topic.subjectId,
      topicId: topic.id,
      type: "SINGLE" as const,
      text: `Load question ${i}`,
      options: ["right", "wrong", "wrong", "wrong"],
      correctOptions: ["A"],
      explanation: "Because.",
      difficulty: "EASY" as const,
      expectedTimeSec: 60,
      status: "PUBLISHED" as const,
    })),
  });
  const saved = await saveBlueprint(
    {
      title: "Load test",
      slug: "load-test",
      kind: "TOPIC",
      platformStyle: "TCS_ION",
      navigation: "SEQUENTIAL",
      description: null,
      instructions: null,
      companyId: null,
      sections: [
        {
          name: "Aptitude",
          type: "MCQ",
          minutes: 30,
          marksPerItem: 1,
          negativeMarks: 0.25,
          canGoBack: true,
          rules: [{ topicId: topic.id, difficulty: null, count: QUESTIONS }],
        },
      ],
    },
    admin,
  );
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  expect(await transitionBlueprint(saved.id, "publish", admin)).toEqual({ ok: true });

  const count = Math.max(STUDENTS, JUDGE_SUBMISSIONS);
  await db.user.createMany({
    data: Array.from({ length: count }, (_, i) => ({
      name: `Load ${i}`,
      email: `load-${i}@load.example`,
      roles: ["STUDENT" as const],
      onboardedAt: new Date(),
    })),
  });
  students = (
    await db.user.findMany({
      where: { email: { endsWith: "@load.example" }, roles: { has: "STUDENT" } },
      orderBy: { email: "asc" },
    })
  ).map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    roles: ["STUDENT"],
    profileType: "FRESHER",
    onboarded: true,
  }));
}, 600_000);

// ---------- scenarios ----------

describe("load", () => {
  it(`${STUDENTS} students sit a ${QUESTIONS}-question test at the same time`, async () => {
    timings.clear();
    failures = [];
    const started = performance.now();
    await Promise.all(
      students.slice(0, STUDENTS).map(async (student) => {
        try {
          const sitting = await timed("start", () => startSitting(student, "load-test"));
          if (sitting.status !== "started") throw new Error(`start: ${sitting.status}`);
          const { sittingId } = sitting;
          const view = await timed("view", () => getRunnerView(student, sittingId));
          if (view?.status !== "running") throw new Error("view: not running");
          // Autosave after every answer, as the runner does.
          for (const [i, item] of view.view.items.entries()) {
            const saved = await timed("save", () =>
              saveItem(student, sittingId, item.id, {
                selectedOptions: [i % 4 === 0 ? "B" : "A"],
                visited: true,
                addTimeSec: 30,
              }),
            );
            if (!saved.ok) throw new Error(`save: ${saved.reason}`);
          }
          await timed("advance", () => advanceSection(student, sittingId, 0));
          await timed("submit", () => submitSitting(student, sittingId));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push(message.trim().split("\n").pop()!);
        }
      }),
    );
    const seconds = (performance.now() - started) / 1000;
    const rows = report(`${STUDENTS} concurrent test-takers`, seconds);

    expect(failures).toEqual([]);
    expect(await db.testSitting.count({ where: { status: "SUBMITTED" } })).toBe(STUDENTS);
    for (const [op, budget] of Object.entries(BUDGET_P95_MS))
      expect.soft(rows.get(op)?.["p95 ms"] ?? 0, `p95 of ${op}`).toBeLessThanOrEqual(budget);
  }, 600_000);

  it(`the judge works through ${JUDGE_SUBMISSIONS} submissions`, async () => {
    const results: { workers: number; perMinute: number; seconds: number }[] = [];
    for (const workers of [1, 4, 8]) {
      await db.submission.deleteMany();
      const ids: string[] = [];
      for (const student of students.slice(0, JUDGE_SUBMISSIONS)) {
        const result = await createSubmission(student, {
          problemId,
          language: "python",
          code: python,
          kind: "SUBMIT",
        });
        if (result.status !== "queued") throw new Error(JSON.stringify(result));
        ids.push(result.submissionId);
      }
      const started = performance.now();
      // What the worker does with WORKER_CONCURRENCY=workers.
      await pool(ids, workers, (id) => judgeSubmission(id));
      const seconds = (performance.now() - started) / 1000;
      results.push({ workers, seconds, perMinute: Math.round((ids.length / seconds) * 60) });
      expect(await db.submission.count({ where: { verdict: "ACCEPTED" } })).toBe(ids.length);
    }
    console.log(`\nJudge: ${JUDGE_SUBMISSIONS} Python submissions (local judge)`);
    console.table(
      results.map((r) => ({
        workers: r.workers,
        "time s": r.seconds.toFixed(1),
        "per minute": r.perMinute,
      })),
    );
  }, 900_000);

  it.skipIf(!process.env.LOAD_BASE_URL)(
    "public pages serve under concurrent visitors",
    async () => {
      const base = process.env.LOAD_BASE_URL!;
      const paths = ["/", "/companies", "/questions", "/problems", "/jobs"];
      const concurrency = 50;
      const durationMs = 20_000;
      timings.clear();
      failures = [];
      const end = Date.now() + durationMs;
      let n = 0;
      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (Date.now() < end) {
            const path = paths[n++ % paths.length]!;
            const response = await timed(path, () => fetch(base + path));
            await response.arrayBuffer();
            if (!response.ok) failures.push(`${path}: ${response.status}`);
          }
        }),
      );
      report(`HTTP, ${concurrency} concurrent visitors`, durationMs / 1000);
      expect(failures.slice(0, 5)).toEqual([]);
    },
    120_000,
  );
});
