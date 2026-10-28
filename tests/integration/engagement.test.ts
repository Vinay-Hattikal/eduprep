// Phase 7 engagement features end to end: All-India mock tests (frozen question set, live and
// final ranks, hidden solutions), streak freezes and badges, question discussions with flags and
// moderation, "asked today" drive reports, the jobs board and share cards.

import { beforeAll, describe, expect, it } from "vitest";
import { addDays, istDay } from "@/lib/learning/dates";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { drainJobs } from "@/server/jobs/runner";
import { saveBlueprint } from "@/server/services/blueprints";
import {
  copyContestToNextWeek,
  finalizeContest,
  getContest,
  leaderboard,
  publishContest,
  saveContest,
  standing,
  startContestSitting,
  unpublishContest,
} from "@/server/services/contests";
import {
  deleteOwnComment,
  flagComment,
  getDiscussion,
  listForModeration,
  moderateComment,
  postComment,
  setCommentBlock,
  toggleVote,
} from "@/server/services/discussions";
import {
  moderateDriveReport,
  recentDriveReports,
  submitDriveReport,
} from "@/server/services/drive-reports";
import {
  buyStreakFreeze,
  freezeRules,
  listBadges,
  recordDailyActivity,
} from "@/server/services/engagement";
import {
  listOpenJobs,
  recordApplyClick,
  savePosting,
  setPostingStatus,
  toggleSaveJob,
} from "@/server/services/job-postings";
import { submitAnswer } from "@/server/services/practice";
import { createShareCard, getShareCard, revokeShareCard } from "@/server/services/share-cards";
import { getSittingResult, saveItem, submitSitting } from "@/server/services/tests";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let adminId: string;
const admin = () => ({ id: adminId, roles: ["ADMIN" as const] });
const students: CurrentUser[] = [];
const questionIds: string[] = [];

async function student(name: string): Promise<CurrentUser> {
  const user = await db.user.create({
    data: {
      name,
      email: `${name.toLowerCase().replace(/\s+/g, ".")}@test.example`,
      roles: ["STUDENT"],
      onboardedAt: new Date(),
    },
  });
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    roles: ["STUDENT"],
    profileType: "FRESHER",
    onboarded: true,
  };
}

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["ADMIN"], "admin@test.example")).id;
  await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), adminId);
  await importFile(
    "COMPANIES",
    "companies.csv",
    await template("companies/companies.csv"),
    adminId,
  );
  await db.company.updateMany({ data: { status: "PUBLISHED" } });

  // Eight published questions: option A is right for every one.
  const topic = await db.topic.findUniqueOrThrow({ where: { slug: "percentages" } });
  for (let i = 1; i <= 8; i++) {
    const q = await db.question.create({
      data: {
        externalId: `QA-E-${i}`,
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
    questionIds.push(q.id);
  }
  for (const name of ["Asha Rao", "Bala Krishnan", "Chitra Menon", "Dev Patel"])
    students.push(await student(name));
}, 180_000);

describe("All-India mock tests", () => {
  const t0 = new Date();
  const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
  let contestId: string;
  let slug: string;

  it("freezes one question set when published", async () => {
    const topic = await db.topic.findUniqueOrThrow({ where: { slug: "percentages" } });
    const format = await saveBlueprint(
      {
        title: "Weekly format",
        slug: "weekly-format",
        kind: "TOPIC",
        platformStyle: "GENERIC",
        navigation: "FREE",
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
            rules: [{ topicId: topic.id, difficulty: null, count: 4 }],
          },
        ],
      },
      admin(),
    );
    if (!format.ok) throw new Error(JSON.stringify(format));

    slug = "weekly-all-india-1";
    const saved = await saveContest(
      {
        slug,
        title: "Weekly All-India Mock #1",
        description: null,
        blueprintId: format.id,
        startsAt: at(-1),
        endsAt: at(60),
      },
      admin(),
    );
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    contestId = saved.id;
    expect(await publishContest(contestId, admin())).toEqual({ ok: true });
    expect(await db.contestItem.count({ where: { contestId } })).toBe(4);
    // A published contest can't be edited, and the finalize job is queued for the results.
    expect(await db.job.count({ where: { type: "contest.finalize" } })).toBe(1);
  });

  it("gives everyone the same questions, once", async () => {
    const sets: string[][] = [];
    // Asha 4 right fast, Bala 4 right slower, Chitra 2 right, Dev 0 right.
    const plans = [
      { right: 4, finishAt: 5 },
      { right: 4, finishAt: 8 },
      { right: 2, finishAt: 6 },
      { right: 0, finishAt: 7 },
    ];
    for (const [index, plan] of plans.entries()) {
      const user = students[index]!;
      const started = await startContestSitting(user, slug, at(1));
      if (started.status !== "started") throw new Error(started.status);
      expect(await startContestSitting(user, slug, at(2))).toEqual(started);
      const items = await db.sittingItem.findMany({ where: { sittingId: started.sittingId } });
      sets.push(items.map((i) => i.questionId!).sort());
      for (const [i, item] of items.entries()) {
        await saveItem(
          user,
          started.sittingId,
          item.id,
          { selectedOptions: [i < plan.right ? "A" : "B"] },
          at(2),
        );
      }
      // Sittings start at at(1); submitting later means more time taken.
      await submitSitting(user, started.sittingId, at(plan.finishAt));
      expect((await startContestSitting(user, slug, at(9))).status).toBe("finished");
    }
    expect(new Set(sets.map((s) => s.join())).size).toBe(1);
    // Contest sittings don't appear as normal attempts at the format.
    expect((await getContest(slug, students[0]!.id, at(10)))?.participants).toBe(4);
  });

  it("ranks live by score, then time", async () => {
    const board = await leaderboard(contestId);
    expect(board.map((r) => [r.name, r.score, r.rank])).toEqual([
      ["Asha R.", 4, 1],
      ["Bala K.", 4, 2],
      ["Chitra M.", 1.5, 3],
      ["Dev P.", -1, 4],
    ]);
    expect(await standing(contestId, students[2]!.id)).toEqual({
      rank: 3,
      total: 4,
      percentile: 50,
      final: false,
    });
  });

  it("keeps answers hidden until results are final", async () => {
    const sitting = await db.testSitting.findFirstOrThrow({
      where: { contestId, userId: students[0]!.id },
    });
    const live = await getSittingResult(students[0]!, sitting.id, at(10));
    expect(live?.items).toEqual([]);
    expect(live?.contest?.solutionsAt).not.toBeNull();
    expect(JSON.stringify(live)).not.toContain("Because.");
    expect((await unpublishContest(contestId, admin())).ok).toBe(false);
    // Too early to share a rank.
    const early = await createShareCard(students[0]!, "CONTEST", sitting.id);
    expect(early).toEqual({ ok: false, error: "Share your rank once the results are final." });
  });

  it("freezes ranks, awards badges and tells everyone when final", async () => {
    await finalizeContest(contestId, at(30)); // not final yet: re-queued, nothing frozen
    expect(
      (await db.contest.findUniqueOrThrow({ where: { id: contestId } })).finalizedAt,
    ).toBeNull();

    const later = at(60 + 10 + 6);
    await finalizeContest(contestId, later);
    await finalizeContest(contestId, later); // second run does nothing
    const sittings = await db.testSitting.findMany({
      where: { contestId },
      orderBy: { finalRank: "asc" },
      select: { userId: true, finalRank: true, finalPercentile: true },
    });
    expect(sittings.map((s) => [s.finalRank, s.finalPercentile])).toEqual([
      [1, 100],
      [2, 100],
      [3, 50],
      [4, 25],
    ]);
    const asha = (await listBadges(students[0]!.id)).map((b) => b.id);
    expect(asha).toEqual(expect.arrayContaining(["contest-debut", "contest-top-10", "first-test"]));
    expect((await listBadges(students[3]!.id)).map((b) => b.id)).not.toContain("contest-top-10");
    expect(
      await db.notification.count({ where: { template: "contest.result", channel: "EMAIL" } }),
    ).toBe(4);

    const sitting = await db.testSitting.findFirstOrThrow({
      where: { contestId, userId: students[0]!.id },
    });
    const final = await getSittingResult(students[0]!, sitting.id, later);
    expect(final?.items).toHaveLength(4);
    expect(final?.contest?.solutionsAt).toBeNull();
    expect((await standing(contestId, students[0]!.id))?.final).toBe(true);

    const card = await createShareCard(students[0]!, "CONTEST", sitting.id);
    if (!card.ok) throw new Error(card.error);
    expect((await getShareCard(card.id))?.data).toMatchObject({
      name: "Asha R.",
      title: "Weekly All-India Mock #1",
      headline: "All-India rank 1 of 4",
      detail: "100 percentile",
    });
  });

  it("copies a contest to next week as a draft", async () => {
    const copy = await copyContestToNextWeek(contestId, admin());
    if (!copy.ok) throw new Error(copy.error);
    const next = await db.contest.findUniqueOrThrow({ where: { id: copy.id } });
    expect(next.status).toBe("DRAFT");
    expect(next.startsAt.getTime() - at(-1).getTime()).toBe(7 * 86_400_000);
  });
});

describe("streak freezes and badges", () => {
  const rules = { earnEvery: 7, maxFreezes: 2 };

  it("earns a freeze at 7 days and uses it for a missed day", async () => {
    const user = await student("Esha Nair");
    const day0 = addDays(istDay(), -20);
    const run = (offset: number) =>
      db.$transaction((tx) =>
        recordDailyActivity(tx, user.id, addDays(day0, offset), { attempts: 1, correct: 1 }, rules),
      );
    for (let d = 0; d < 7; d++) await run(d);
    let stats = await db.userStats.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stats).toMatchObject({ currentStreak: 7, streakFreezes: 1 });
    expect((await listBadges(user.id)).map((b) => b.id)).toEqual(
      expect.arrayContaining(["streak-3", "streak-7"]),
    );

    const update = await run(8); // missed day 7
    expect(update).toMatchObject({ currentStreak: 8, frozeDays: 1 });
    stats = await db.userStats.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stats).toMatchObject({ currentStreak: 8, streakFreezes: 0, freezesUsed: 1 });

    await run(11); // missed two days, no freezes left
    stats = await db.userStats.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stats.currentStreak).toBe(1);
    expect(stats.longestStreak).toBe(8);
  });

  it("sells freezes for points, up to the limit", async () => {
    const user = await student("Farah Khan");
    expect(await buyStreakFreeze(user.id)).toMatchObject({ ok: false });
    await db.userStats.create({ data: { userId: user.id, points: 120 } });
    expect(await buyStreakFreeze(user.id)).toEqual({ ok: true, freezes: 1, points: 70 });
    expect(await buyStreakFreeze(user.id)).toEqual({ ok: true, freezes: 2, points: 20 });
    expect(await buyStreakFreeze(user.id)).toEqual({
      ok: false,
      error: "You already hold 2, the most you can.",
    });
    expect(await freezeRules()).toEqual({ earnEvery: 7, maxFreezes: 2 });
  });
});

describe("question discussions", () => {
  let commentId: string;
  let questionId: string;

  // Its own question: contest answers count as answering, and the contest drew at random.
  beforeAll(async () => {
    const topic = await db.topic.findUniqueOrThrow({ where: { slug: "percentages" } });
    const q = await db.question.create({
      data: {
        externalId: "QA-E-DISCUSS",
        subjectId: topic.subjectId,
        topicId: topic.id,
        type: "SINGLE",
        text: "Discussion question",
        options: ["right", "wrong", "wrong", "wrong"],
        correctOptions: ["A"],
        explanation: "Because.",
        difficulty: "EASY",
        expectedTimeSec: 60,
        status: "PUBLISHED",
      },
    });
    questionId = q.id;
  });

  it("opens only after answering", async () => {
    const [asha, bala] = students;
    expect(await getDiscussion(asha!, questionId)).toEqual({ status: "locked" });
    expect(await postComment(asha!, { questionId, body: "Hello there" })).toEqual({
      ok: false,
      error: "Answer the question first.",
    });
    for (const user of [asha!, bala!]) {
      await submitAnswer(user, {
        questionId,
        selectedOptions: ["A"],
        numericAnswer: null,
        timeSec: 30,
        mode: "PRACTICE",
      });
    }
    expect(
      await postComment(asha!, { questionId, body: "See https://spam.example for answers" }),
    ).toEqual({ ok: false, error: "Links aren't allowed in discussions." });
    expect(
      await postComment(asha!, { questionId, body: "Take 100 as the base; it's quicker." }),
    ).toEqual({ ok: true });
    const view = await getDiscussion(bala!, questionId);
    if (view.status !== "open") throw new Error("locked");
    commentId = view.comments[0]!.id;
    expect(view.comments[0]).toMatchObject({ author: "Asha R.", mine: false, voteCount: 0 });

    expect(
      await postComment(bala!, { questionId, body: "Nice trick, thanks!", parentId: commentId }),
    ).toEqual({ ok: true });
    const withReply = await getDiscussion(asha!, questionId);
    if (withReply.status !== "open") throw new Error("locked");
    expect(withReply.comments[0]!.replies).toHaveLength(1);
    expect(withReply.total).toBe(2);
  });

  it("counts votes, never your own", async () => {
    const [asha, bala] = students;
    expect(await toggleVote(asha!, commentId)).toEqual({
      ok: false,
      error: "You can't upvote yourself.",
    });
    expect(await toggleVote(bala!, commentId)).toEqual({ ok: true, voted: true, voteCount: 1 });
    expect(await toggleVote(bala!, commentId)).toEqual({ ok: true, voted: false, voteCount: 0 });
  });

  it("hides a comment after enough flags, until a moderator decides", async () => {
    const flaggers = [students[1]!, students[2]!, students[3]!];
    for (const user of flaggers.slice(1)) {
      await submitAnswer(user, {
        questionId,
        selectedOptions: ["B"],
        numericAnswer: null,
        timeSec: 30,
        mode: "PRACTICE",
      });
    }
    for (const user of flaggers)
      expect(await flagComment(user, commentId, "SPAM")).toEqual({ ok: true });
    expect(await flagComment(flaggers[0]!, commentId, "SPAM")).toEqual({
      ok: false,
      error: "That comment is no longer there.",
    });
    const hidden = await db.questionComment.findUniqueOrThrow({ where: { id: commentId } });
    expect(hidden).toMatchObject({ status: "HIDDEN", flagCount: 3 });
    expect((await listForModeration("flagged")).map((c) => c.id)).toContain(commentId);

    expect(await moderateComment(commentId, "keep", { id: adminId })).toEqual({ ok: true });
    expect(await db.questionComment.findUniqueOrThrow({ where: { id: commentId } })).toMatchObject({
      status: "VISIBLE",
      flagCount: 0,
    });
    expect(await listForModeration("flagged")).toEqual([]);
  });

  it("lets authors delete and moderators block posting", async () => {
    const [asha] = students;
    expect(await deleteOwnComment(asha!, commentId)).toEqual({ ok: true });
    await setCommentBlock(asha!.id, true, { id: adminId });
    expect(await postComment(asha!, { questionId, body: "Another thought here" })).toEqual({
      ok: false,
      error: "A moderator has turned off posting for your account.",
    });
  });
});

describe("drive reports", () => {
  it("accepts recent drives, publishes on approval with points and a badge", async () => {
    const user = students[1]!;
    const company = await db.company.findFirstOrThrow({ where: { status: "PUBLISHED" } });
    const today = istDay();
    const input = {
      companyId: company.id,
      driveDate: addDays(today, -1),
      roundType: "ONLINE_TEST" as const,
      platform: "TCS iON",
      topics: "Quant, reasoning",
      questions: "A train question and two on percentages.",
      difficulty: "MEDIUM" as const,
      location: "Pune",
    };
    expect((await submitDriveReport(user, { ...input, driveDate: addDays(today, -30) })).ok).toBe(
      false,
    );
    expect(await submitDriveReport(user, input)).toEqual({ ok: true });
    expect(await recentDriveReports(company.id)).toEqual([]);

    const report = await db.driveReport.findFirstOrThrow({ where: { userId: user.id } });
    expect((await moderateDriveReport(report.id, "reject", { id: adminId })).ok).toBe(false);
    expect(
      (await moderateDriveReport(report.id, "approve", { id: adminId }, { topics: "Quant" })).ok,
    ).toBe(true);
    const shown = await recentDriveReports(company.id);
    expect(shown).toHaveLength(1);
    expect(shown[0]!.topics).toBe("Quant");
    expect((await db.userStats.findUniqueOrThrow({ where: { userId: user.id } })).points).toBe(10);
    expect((await listBadges(user.id)).map((b) => b.id)).toContain("contributor");
  });
});

describe("jobs board", () => {
  let jobId: string;
  const base = {
    title: "Graduate Engineer Trainee",
    companyId: null,
    companyName: "Globex",
    locations: ["Bengaluru", "Pune"],
    workMode: "HYBRID" as const,
    jobType: "FULL_TIME" as const,
    audience: ["FRESHER" as const],
    minExperience: 0,
    maxExperience: 0,
    salary: "4–6 LPA",
    skills: ["Java", "SQL"],
    description: "Build and maintain internal tools with a friendly team of engineers.",
    branches: ["CSE", "IT"],
    gradYears: [2026],
    minCgpa: 6.5,
    maxBacklogs: 0,
    applyUrl: "https://careers.globex.example/jobs/123",
    applyBy: null,
  };

  it("lists only published, open postings, with filters", async () => {
    const saved = await savePosting(base, { id: adminId });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    jobId = saved.id;
    expect((await listOpenJobs({})).total).toBe(0);
    expect(await setPostingStatus(jobId, "publish", { id: adminId })).toEqual({ ok: true });

    const expired = await savePosting(
      { ...base, title: "Old role", applyBy: addDays(istDay(), -1) },
      { id: adminId },
    );
    if (!expired.ok) throw new Error("save");
    expect((await setPostingStatus(expired.id, "publish", { id: adminId })).ok).toBe(false);

    expect((await listOpenJobs({})).jobs.map((j) => j.title)).toEqual([
      "Graduate Engineer Trainee",
    ]);
    expect((await listOpenJobs({ q: "globex" })).total).toBe(1);
    expect((await listOpenJobs({ type: "INTERNSHIP" })).total).toBe(0);
    expect((await listOpenJobs({ location: "Pune" })).total).toBe(1);
    expect((await listOpenJobs({ audience: "EXPERIENCED" })).total).toBe(0);
  });

  it("counts apply clicks once per student and stops when closed", async () => {
    const job = await db.jobPosting.findUniqueOrThrow({ where: { id: jobId } });
    const [asha, bala] = students;
    expect(await recordApplyClick(job.slug, asha!.id)).toBe(base.applyUrl);
    expect(await recordApplyClick(job.slug, asha!.id)).toBe(base.applyUrl);
    expect(await recordApplyClick(job.slug, bala!.id)).toBe(base.applyUrl);
    expect(await recordApplyClick(job.slug, null)).toBe(base.applyUrl);
    expect((await db.jobPosting.findUniqueOrThrow({ where: { id: jobId } })).applyClicks).toBe(3);

    expect(await toggleSaveJob(asha!.id, jobId)).toBe(true);
    expect(await toggleSaveJob(asha!.id, jobId)).toBe(false);

    await setPostingStatus(jobId, "close", { id: adminId });
    expect(await recordApplyClick(job.slug, asha!.id)).toBeNull();
    expect((await listOpenJobs({})).total).toBe(0);
  });
});

describe("share cards", () => {
  it("shares a badge publicly until the student turns it off", async () => {
    const asha = students[0]!;
    expect((await createShareCard(asha, "BADGE", "streak-100")).ok).toBe(false);
    const card = await createShareCard(asha, "BADGE", "first-test");
    if (!card.ok) throw new Error(card.error);
    expect(card.id).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect((await getShareCard(card.id))?.data).toMatchObject({
      title: "Test taker",
      headline: "Badge earned",
    });
    // Sharing again reuses the link.
    expect(await createShareCard(asha, "BADGE", "first-test")).toEqual(card);
    expect(await revokeShareCard(students[1]!, card.id)).toBe(false);
    expect(await revokeShareCard(asha, card.id)).toBe(true);
    expect(await getShareCard(card.id)).toBeNull();
    expect(await getShareCard("../../etc")).toBeNull();
  });

  afterAllJobs();
});

function afterAllJobs() {
  it("leaves no failed jobs behind", async () => {
    await drainJobs();
    expect(await db.job.count({ where: { status: "FAILED" } })).toBe(0);
  });
}
