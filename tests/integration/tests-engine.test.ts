// Mock tests end to end: blueprints, frozen draws, sequential sections, autosave, coding inside
// a sitting (real local judge), scoring with negative marks, auto-submit and the free limit.

import { beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { drainJobs } from "@/server/jobs/runner";
import {
  draftFromCompany,
  publishProblems,
  saveBlueprint,
  transitionBlueprint,
} from "@/server/services/blueprints";
import { getJobOverview, getQuestionAnalytics } from "@/server/services/ops";
import { transitionProblem } from "@/server/services/problems";
import {
  advanceSection,
  autoSubmitSitting,
  finishSitting,
  getRunnerView,
  getSittingResult,
  listTests,
  saveItem,
  startSitting,
  submitSitting,
  submitSittingCode,
} from "@/server/services/tests";
import type { BlueprintForm } from "@/schemas/blueprint";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let adminId: string;
let student: CurrentUser;
let blueprintId: string;
const admin = () => ({ id: adminId, roles: ["ADMIN" as const] });

const CPP = `#include <bits/stdc++.h>
using namespace std;
int main(){ long long n,t; cin>>n>>t; unordered_set<long long> s; bool ok=false;
for(long long i=0;i<n;i++){ long long x; cin>>x; if(s.count(t-x)) ok=true; s.insert(x);} cout<<(ok?"YES":"NO")<<"\\n"; }`;

async function blueprint(overrides: Partial<BlueprintForm> = {}): Promise<BlueprintForm> {
  const percentages = await db.topic.findUniqueOrThrow({ where: { slug: "percentages" } });
  const arrays = await db.topic.findUniqueOrThrow({ where: { slug: "arrays" } });
  return {
    title: "Aptitude and coding",
    slug: "aptitude-and-coding",
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
        minutes: 10,
        marksPerItem: 1,
        negativeMarks: 0.25,
        canGoBack: true,
        rules: [{ topicId: percentages.id, difficulty: null, count: 4 }],
      },
      {
        name: "Coding",
        type: "CODING",
        minutes: 20,
        marksPerItem: 10,
        negativeMarks: 0,
        canGoBack: true,
        rules: [{ topicId: arrays.id, difficulty: null, count: 1 }],
      },
    ],
    ...overrides,
  };
}

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["ADMIN"], "admin@test.example")).id;
  await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), adminId);
  for (const file of [
    "coding/coding-problems.csv",
    "coding/coding-testcases.csv",
    "coding/coding-solutions.csv",
  ]) {
    const type = file.includes("problems")
      ? "CODING_PROBLEMS"
      : file.includes("testcases")
        ? "CODING_TESTCASES"
        : "CODING_SOLUTIONS";
    await importFile(type, file, await template(file), adminId);
  }
  await drainJobs();
  const problem = await db.problem.findUniqueOrThrow({ where: { externalId: "CODE-ARR-0001" } });
  await transitionProblem(problem.id, "publish", admin());

  // Six published questions: option A is right for every one.
  const topic = await db.topic.findUniqueOrThrow({ where: { slug: "percentages" } });
  for (let i = 1; i <= 6; i++) {
    await db.question.create({
      data: {
        externalId: `QA-T-${i}`,
        subjectId: topic.subjectId,
        topicId: topic.id,
        type: "SINGLE",
        text: `Question ${i}`,
        options: ["right", "wrong", "wrong", "wrong"],
        correctOptions: ["A"],
        explanation: "Because.",
        difficulty: "EASY",
        expectedTimeSec: 60,
        status: "PUBLISHED",
      },
    });
  }
  const user = await db.user.create({
    data: {
      name: "Taker",
      email: "taker@test.example",
      roles: ["STUDENT"],
      onboardedAt: new Date(),
    },
  });
  student = {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: ["STUDENT"],
    profileType: "FRESHER",
    onboarded: true,
  };
}, 180_000);

describe("blueprints", () => {
  it("won't publish a test that can't draw enough items", async () => {
    const form = await blueprint();
    form.sections[0]!.rules[0]!.count = 50;
    const saved = await saveBlueprint(form, admin());
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    blueprintId = saved.id;
    const problems = await publishProblems(blueprintId);
    expect(problems.join(" ")).toMatch(/needs 50, only 6 published questions/);
    expect((await transitionBlueprint(blueprintId, "publish", admin())).ok).toBe(false);

    const fixed = await saveBlueprint({ ...(await blueprint()), id: blueprintId }, admin());
    expect(fixed.ok).toBe(true);
    expect(await transitionBlueprint(blueprintId, "publish", admin())).toEqual({ ok: true });
    const cards = await listTests(student);
    expect(cards[0]).toMatchObject({
      slug: "aptitude-and-coding",
      minutes: 30,
      items: 5,
      locked: false,
    });
  });
});

describe("taking a sequential test", () => {
  // Real time: the auto-submit job is queued for when the test really ends.
  const t0 = new Date();
  const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
  let sittingId: string;

  it("draws items once and resumes the same sitting", async () => {
    const started = await startSitting(student, "aptitude-and-coding", t0);
    if (started.status !== "started") throw new Error(started.status);
    sittingId = started.sittingId;
    const again = await startSitting(student, "aptitude-and-coding", at(1));
    expect(again).toEqual(started);
    const view = await getRunnerView(student, sittingId, at(1));
    if (view?.status !== "running") throw new Error("not running");
    expect(view.view.items).toHaveLength(5);
    expect(view.view.current).toBe(0);
    // No answers leak to the browser.
    expect(JSON.stringify(view.view)).not.toContain("correctOptions");
    expect(JSON.stringify(view.view)).not.toContain("Because.");
  });

  it("only accepts answers in the open section", async () => {
    const items = await db.sittingItem.findMany({
      where: { sittingId },
      orderBy: [{ sectionIndex: "asc" }, { position: "asc" }],
    });
    const mcqs = items.filter((i) => i.sectionIndex === 0);
    const coding = items.find((i) => i.sectionIndex === 1)!;

    // 3 right, 1 wrong.
    for (const [index, item] of mcqs.entries()) {
      const result = await saveItem(
        student,
        sittingId,
        item.id,
        { selectedOptions: [index < 3 ? "A" : "B"], addTimeSec: 40 },
        at(2),
      );
      expect(result).toEqual({ ok: true });
    }
    expect(
      await saveItem(student, sittingId, mcqs[0]!.id, { selectedOptions: ["Z"] }, at(2)),
    ).toEqual({ ok: false, reason: "invalid" });
    expect(
      await saveItem(student, sittingId, mcqs[0]!.id, { selectedOptions: ["A", "B"] }, at(2)),
    ).toEqual({ ok: false, reason: "invalid" });
    // The coding section hasn't opened yet.
    const early = await submitSittingCode(
      student,
      sittingId,
      coding.id,
      { language: "cpp", code: CPP, kind: "SUBMIT" },
      at(3),
    );
    expect(early.status).toBe("closed");

    expect(await advanceSection(student, sittingId, 0, at(4))).toBe(true);
    expect(await advanceSection(student, sittingId, 0, at(4))).toBe(false);
    // Section 1 is closed now; a few seconds of grace, then no more changes.
    expect(
      await saveItem(student, sittingId, mcqs[3]!.id, { selectedOptions: ["A"] }, at(4.1)),
    ).toEqual({ ok: true });
    await saveItem(student, sittingId, mcqs[3]!.id, { selectedOptions: ["B"] }, at(4.1));
    expect(
      await saveItem(student, sittingId, mcqs[3]!.id, { selectedOptions: ["A"] }, at(5)),
    ).toEqual({ ok: false, reason: "closed" });

    const submitted = await submitSittingCode(
      student,
      sittingId,
      coding.id,
      { language: "cpp", code: CPP, kind: "SUBMIT" },
      at(6),
    );
    expect(submitted.status).toBe("queued");
    await drainJobs();
  });

  it("scores with negative marks and coding marks", async () => {
    await submitSitting(student, sittingId, at(10));
    // A second submit (or the auto-submit job) changes nothing.
    await finishSitting(sittingId, { auto: true, now: at(40) });
    const result = await getSittingResult(student, sittingId);
    expect(result).toMatchObject({ score: 12.75, maxScore: 14, autoSubmitted: false });
    expect(result!.sections.map((s) => [s.name, s.score, s.correct, s.attempted])).toEqual([
      ["Aptitude", 2.75, 3, 4],
      ["Coding", 10, 1, 1],
    ]);
    expect(result!.sections[0]!.timeSec).toBe(160);
    expect(result!.items.find((i) => i.kind === "coding")).toMatchObject({
      best: { verdict: "ACCEPTED", score: 1 },
    });

    const attempts = await db.attempt.findMany({ where: { userId: student.id } });
    expect(attempts).toHaveLength(4);
    expect(attempts.every((a) => a.mode === "TEST")).toBe(true);
    expect(await db.mistake.count({ where: { userId: student.id } })).toBe(1);
    const mastery = await db.mastery.findFirstOrThrow({
      where: { userId: student.id, topic: { slug: "percentages" } },
    });
    expect(mastery.attempts).toBe(4);
  });
});

describe("auto-submit and limits", () => {
  it("auto-submits when time runs out, not before", async () => {
    await db.testSitting.deleteMany();
    const start = new Date();
    const started = await startSitting(student, "aptitude-and-coding", start);
    if (started.status !== "started") throw new Error(started.status);
    await autoSubmitSitting(started.sittingId, new Date(start.getTime() + 10 * 60_000));
    expect(
      (await db.testSitting.findUniqueOrThrow({ where: { id: started.sittingId } })).status,
    ).toBe("IN_PROGRESS");
    await autoSubmitSitting(started.sittingId, new Date(start.getTime() + 31 * 60_000));
    const sitting = await db.testSitting.findUniqueOrThrow({ where: { id: started.sittingId } });
    expect(sitting).toMatchObject({ status: "SUBMITTED", autoSubmitted: true, score: 0 });
  });

  it("limits free users to one full mock per company", async () => {
    const company = await db.company.create({
      data: {
        slug: "acme",
        name: "Acme",
        level: "STANDARD",
        category: "SERVICE",
        hiringFor: ["FRESHER"],
        overview: "Test company.",
        lastVerifiedAt: new Date(),
      },
    });
    const saved = await saveBlueprint(
      await blueprint({
        slug: "acme-mock",
        title: "Acme mock",
        kind: "COMPANY_MOCK",
        companyId: company.id,
      }),
      admin(),
    );
    if (!saved.ok) throw new Error("save failed");
    await transitionBlueprint(saved.id, "publish", admin());
    const first = await startSitting(student, "acme-mock");
    if (first.status !== "started") throw new Error(first.status);
    await submitSitting(student, first.sittingId);
    expect(await startSitting(student, "acme-mock")).toEqual({ status: "locked" });
    expect((await listTests(student)).find((c) => c.slug === "acme-mock")?.locked).toBe(true);
    // Admins aren't limited.
    expect((await startSitting(admin(), "acme-mock")).status).toBe("started");
  });
});

describe("admin views", () => {
  it("reports question statistics from attempts", async () => {
    const { rows } = await getQuestionAnalytics({ flaggedOnly: false, minAttempts: 1 });
    expect(rows.length).toBeGreaterThan(0);
    const row = rows[0]!;
    expect(row.attempts).toBeGreaterThan(0);
    expect(row.optionShares).toHaveLength(4);
    expect(row.optionShares.find((o) => o.correct)?.letter).toBe("A");
  });

  it("summarises jobs and the judge", async () => {
    const overview = await getJobOverview();
    expect(overview.judge.name).toBe("local");
    expect(overview.table.map((r) => r.type)).toEqual(
      expect.arrayContaining(["code.judge", "problem.validate"]),
    );
  });

  it("drafts a blueprint from a company's test pattern", async () => {
    const company = await db.company.findUniqueOrThrow({ where: { slug: "acme" } });
    const round = await db.companyRound.create({
      data: { companyId: company.id, order: 1, name: "Online test", type: "ONLINE_TEST" },
    });
    const topics = await db.topic.findMany({
      where: { slug: { in: ["percentages", "averages"] } },
    });
    await db.companySection.create({
      data: {
        roundId: round.id,
        order: 1,
        name: "Quant",
        type: "MCQ",
        questionCount: 5,
        minutes: 15,
        negativeMarks: 0.33,
        topics: { connect: topics.map((t) => ({ id: t.id })) },
      },
    });
    const draft = await draftFromCompany(company.id);
    expect(draft).toMatchObject({
      kind: "COMPANY_MOCK",
      navigation: "SEQUENTIAL",
      companyId: company.id,
    });
    expect(draft!.sections[0]).toMatchObject({ name: "Quant", minutes: 15, negativeMarks: 0.33 });
    expect(draft!.sections[0]!.rules.map((r) => r.count).sort()).toEqual([2, 3]);
  });
});
