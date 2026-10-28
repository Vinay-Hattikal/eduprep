// Admin editors for content that used to come only from imports: coding problems and their
// code, design questions, role tracks, interview types, passages and admin roles.

import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { drainJobs } from "@/server/jobs/runner";
import {
  saveDesignQuestion,
  setDesignStatus,
  type DesignValues,
} from "@/server/services/design-questions";
import { saveInterviewType, type InterviewTypeValues } from "@/server/services/interview-types";
import { deletePassage, savePassage } from "@/server/services/passages";
import {
  addTestCase,
  deleteSolution,
  saveProblem,
  saveSolution,
  transitionProblem,
  type ProblemValues,
} from "@/server/services/problems";
import { saveTrack } from "@/server/services/role-tracks";
import { setAdminAccess } from "@/server/services/user-roles";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let adminId: string;
const admin = () => ({ id: adminId, roles: ["ADMIN" as const] });
let dsaTopicId: string;
let otherTopicId: string;

const PYTHON_SOLUTION = `n, t = map(int, input().split())
nums = list(map(int, input().split()))
seen = set()
ok = False
for x in nums:
    if t - x in seen:
        ok = True
    seen.add(x)
print("YES" if ok else "NO")
`;

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["ADMIN"], "admin@test.example")).id;
  await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), adminId);
  dsaTopicId = (await db.topic.findUniqueOrThrow({ where: { slug: "arrays" } })).id;
  otherTopicId = (await db.topic.findUniqueOrThrow({ where: { slug: "averages" } })).id;
});

function problemValues(overrides: Partial<ProblemValues> = {}): ProblemValues {
  return {
    externalId: "ED-ARR-0001",
    slug: "editor-pair-sum",
    title: "Pair sum (editor)",
    difficulty: "EASY",
    topicIds: [dsaTopicId],
    languages: ["python", "cpp"],
    statement: "Print YES if two different numbers add up to the target, else NO.",
    inputFormat: "n and t, then n numbers",
    outputFormat: "YES or NO",
    constraints: "1 <= n <= 1000",
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    scoring: "ALL_OR_NOTHING",
    checker: "exact",
    source: "ORIGINAL",
    hints: ["Use a set."],
    editorial: null,
    ...overrides,
  };
}

describe("coding problem editor", () => {
  let problemId: string;

  it("creates a draft and refuses duplicates and non-DSA topics", async () => {
    const created = await saveProblem(problemValues(), admin());
    if (!created.ok) throw new Error(JSON.stringify(created));
    expect(created.created).toBe(true);
    problemId = created.id;
    const problem = await db.problem.findUniqueOrThrow({
      where: { id: problemId },
      include: { topics: true },
    });
    expect(problem).toMatchObject({ status: "DRAFT", authorId: adminId, version: 1 });
    expect(problem.topics.map((t) => t.id)).toEqual([dsaTopicId]);

    const duplicate = await saveProblem(problemValues({ topicIds: [otherTopicId] }), admin());
    expect(duplicate).toMatchObject({
      ok: false,
      fieldErrors: {
        externalId: "This ID is already used.",
        slug: "This URL slug is already used.",
        topicIds: expect.stringMatching(/DSA/),
      },
    });
  });

  it("builds a problem from the admin panel that passes the judge and can be published", async () => {
    const tests = [
      ["4 9\n2 7 11 15\n", "YES\n", true],
      ["3 100\n1 2 3\n", "NO\n", false],
      ["2 4\n2 2\n", "YES\n", false],
      ["1 2\n1\n", "NO\n", false],
      ["5 0\n-1 1 3 4 5\n", "YES\n", false],
      ["3 6\n3 1 2\n", "NO\n", false],
    ] as const;
    for (const [input, output, isSample] of tests)
      await addTestCase({ problemId, input, output, isSample, explanation: null }, admin());

    const reference = await saveSolution(
      { problemId, kind: "REFERENCE", language: "python", code: PYTHON_SOLUTION },
      admin(),
    );
    expect(reference).toEqual({ ok: true, revalidating: true });
    await drainJobs();
    const checked = await db.problem.findUniqueOrThrow({ where: { id: problemId } });
    expect(checked.validationNote).not.toMatch(/✗/);
    expect(checked.validatedAt).not.toBeNull();

    expect(await transitionProblem(problemId, "publish", admin())).toEqual({ ok: true });
  });

  it("starter code needs an allowed language, sends the problem to draft, keeps the judge check", async () => {
    const notAllowed = await saveSolution(
      { problemId, kind: "STARTER", language: "java", code: "public class Main {}" },
      admin(),
    );
    expect(notAllowed).toMatchObject({ ok: false, error: expect.stringMatching(/java/) });

    const starter = await saveSolution(
      { problemId, kind: "STARTER", language: "python", code: "# read input\n" },
      admin(),
    );
    expect(starter).toEqual({ ok: true, revalidating: false });
    const after = await db.problem.findUniqueOrThrow({ where: { id: problemId } });
    expect(after.status).toBe("DRAFT");
    expect(after.validatedAt).not.toBeNull();
  });

  it("won't drop a language that still has starter code", async () => {
    const result = await saveProblem(problemValues({ id: problemId, languages: ["cpp"] }), admin());
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: { languages: expect.stringMatching(/python starter/) },
    });
  });

  it("deleting the reference solution clears the judge check", async () => {
    const reference = await db.problemSolution.findFirstOrThrow({
      where: { problemId, kind: "REFERENCE" },
    });
    expect(await deleteSolution(problemId, reference.id, admin())).toEqual({ revalidating: true });
    await drainJobs();
    const after = await db.problem.findUniqueOrThrow({ where: { id: problemId } });
    expect(after.validatedAt).toBeNull();
    expect(after.validationNote).toMatch(/No reference solution/);
  });
});

describe("design question editor", () => {
  const values = (overrides: Partial<DesignValues> = {}): DesignValues => ({
    externalId: "SD-ED-0001",
    slug: "design-url-shortener-editor",
    kind: "SYSTEM_DESIGN",
    title: "Design a URL shortener",
    difficulty: "MEDIUM",
    prompt: "Design a service like a URL shortener.",
    requirements: "Create and resolve short links.",
    approach: "Hash, store, cache.",
    tradeoffs: "Hash collisions vs counters.",
    followUps: null,
    companies: [],
    tracks: [],
    ...overrides,
  });

  it("creates drafts, checks companies, and unpublishes on edit", async () => {
    const unknown = await saveDesignQuestion(values({ companies: ["no-such-company"] }), admin());
    expect(unknown).toMatchObject({
      ok: false,
      fieldErrors: { companies: expect.stringMatching(/no-such-company/) },
    });

    const created = await saveDesignQuestion(values(), admin());
    if (!created.ok) throw new Error(JSON.stringify(created));
    await setDesignStatus(created.id, "PUBLISHED", admin());

    const edited = await saveDesignQuestion(
      values({ id: created.id, title: "Design a link shortener" }),
      admin(),
    );
    expect(edited).toMatchObject({ ok: true, movedToDraft: true });
    const after = await db.designQuestion.findUniqueOrThrow({ where: { id: created.id } });
    expect(after).toMatchObject({ status: "DRAFT", title: "Design a link shortener" });
  });
});

describe("role track editor", () => {
  it("creates a live track and keeps its slug fixed", async () => {
    const values = {
      slug: "editor-switch",
      name: "Service to product (editor)",
      description: "Move to a product company.",
      roadmap: "1. DSA\n2. System design",
      audience: "EXPERIENCED" as const,
      order: 3,
      topicIds: [dsaTopicId, otherTopicId],
      interviewTypes: [],
    };
    const created = await saveTrack(values, admin());
    if (!created.ok) throw new Error(JSON.stringify(created));
    const track = await db.roleTrack.findUniqueOrThrow({
      where: { id: created.id },
      include: { topics: true },
    });
    expect(track.status).toBe("PUBLISHED");
    expect(track.topics).toHaveLength(2);

    const renamed = await saveTrack({ ...values, id: created.id, slug: "other-slug" }, admin());
    expect(renamed).toMatchObject({ ok: false, fieldErrors: { slug: expect.any(String) } });
    const unknownType = await saveTrack(
      { ...values, id: created.id, interviewTypes: ["nope"] },
      admin(),
    );
    expect(unknownType).toMatchObject({
      ok: false,
      fieldErrors: { interviewTypes: expect.any(String) },
    });
  });
});

describe("interview type editor", () => {
  const values = (overrides: Partial<InterviewTypeValues> = {}): InterviewTypeValues => ({
    slug: "editor-hr",
    name: "HR round",
    description: "Behavioural questions.",
    audience: "BOTH",
    durationMin: 45,
    priceSetting: "interviews.hr",
    order: 0,
    active: true,
    rubric: [{ key: "communication", label: "Communication", description: "Clear answers." }],
    ...overrides,
  });

  it("only takes interview prices and keeps the slug fixed", async () => {
    const badPrice = await saveInterviewType(
      values({ priceSetting: "pricing.proMonthly" }),
      admin(),
    );
    expect(badPrice).toMatchObject({
      ok: false,
      fieldErrors: { priceSetting: expect.any(String) },
    });

    const created = await saveInterviewType(values(), admin());
    if (!created.ok) throw new Error(JSON.stringify(created));
    const edited = await saveInterviewType(
      values({ id: created.id, active: false, rubric: [] }),
      admin(),
    );
    expect(edited).toMatchObject({ ok: true, created: false });
    const type = await db.interviewType.findUniqueOrThrow({ where: { id: created.id } });
    expect(type.active).toBe(false);

    const moved = await saveInterviewType(values({ id: created.id, slug: "renamed" }), admin());
    expect(moved).toMatchObject({ ok: false, fieldErrors: { slug: expect.any(String) } });
  });
});

describe("passage editor", () => {
  it("creates, edits and only deletes unused passages", async () => {
    const created = await savePassage(
      { externalId: "RC-ED-0001", title: "Rivers", body: "Rivers flow.\r\nSome are long." },
      admin(),
    );
    if (!created.ok) throw new Error(JSON.stringify(created));
    const stored = await db.passage.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.body).toBe("Rivers flow.\nSome are long.");

    const renamedId = await savePassage(
      { id: created.id, externalId: "RC-ED-0002", title: "Rivers", body: "x" },
      admin(),
    );
    expect(renamedId).toMatchObject({ ok: false, fieldErrors: { externalId: expect.any(String) } });

    const topic = await db.topic.findUniqueOrThrow({ where: { id: otherTopicId } });
    await db.question.create({
      data: {
        externalId: "QA-ED-0001",
        subjectId: topic.subjectId,
        topicId: topic.id,
        type: "SINGLE",
        text: "Which river is longest?",
        options: ["A", "B"],
        correctOptions: ["A"],
        explanation: "Because.",
        difficulty: "EASY",
        expectedTimeSec: 30,
        passageId: created.id,
      },
    });
    expect(await deletePassage(created.id, admin())).toMatchObject({ ok: false });

    const unused = await savePassage(
      { externalId: "RC-ED-0003", title: "Unused", body: "Nothing uses this." },
      admin(),
    );
    if (!unused.ok) throw new Error("expected success");
    expect(await deletePassage(unused.id, admin())).toEqual({ ok: true });
    expect(await db.passage.findUnique({ where: { id: unused.id } })).toBeNull();
  });
});

describe("admin access", () => {
  it("turns admin access on and off and protects the last admin", async () => {
    const other = await createUser(["STUDENT"], "student@test.example");
    expect(await setAdminAccess(other.id, true, admin())).toEqual({ ok: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).roles).toEqual([
      "STUDENT",
      "ADMIN",
    ]);

    const own = await setAdminAccess(adminId, false, admin());
    expect(own).toMatchObject({ ok: false, error: expect.stringMatching(/your own/) });

    // Two admins now: the other one can remove the first, but not the last.
    expect(await setAdminAccess(adminId, false, { id: other.id })).toEqual({ ok: true });
    expect((await db.user.findUniqueOrThrow({ where: { id: adminId } })).roles).toEqual([
      "STUDENT",
    ]);
    const outsider = await createUser(["STUDENT"], "outsider@test.example");
    expect(await setAdminAccess(other.id, false, { id: outsider.id })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/at least one/),
    });

    const log = await db.auditLog.findMany({ where: { action: "user.roles" } });
    expect(log.length).toBe(2);
  });
});
