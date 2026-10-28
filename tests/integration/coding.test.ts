// Coding platform end to end with the real local judge (gcc/g++, Python, Java, Node must be
// installed, as on CI): imports, judge validation, submissions, progress.

import { strToU8, zipSync } from "fflate";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { drainJobs } from "@/server/jobs/runner";
import {
  createSubmission,
  getSubmission,
  getWorkspaceProblem,
  judgeSubmission,
  listProblems,
  revealHint,
} from "@/server/services/coding";
import { transitionProblem } from "@/server/services/problems";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let adminId: string;
let student: CurrentUser;
const admin = () => ({ id: adminId, roles: ["ADMIN" as const] });

const CPP_SOLUTION = `#include <bits/stdc++.h>
using namespace std;
int main(){ long long n,t; cin>>n>>t; unordered_set<long long> s; bool ok=false;
for(long long i=0;i<n;i++){ long long x; cin>>x; if(s.count(t-x)) ok=true; s.insert(x);} cout<<(ok?"YES":"NO")<<"\\n"; }`;
const WRONG_PYTHON = 'print("YES")';

async function problem() {
  return db.problem.findUniqueOrThrow({ where: { externalId: "CODE-ARR-0001" } });
}

async function submit(
  code: string,
  language: string,
  kind: "RUN" | "SUBMIT",
  customInput?: string,
) {
  const result = await createSubmission(student, {
    problemId: (await problem()).id,
    language,
    code,
    kind,
    customInput,
  });
  if (result.status !== "queued") throw new Error(`not queued: ${JSON.stringify(result)}`);
  await drainJobs();
  return (await getSubmission(student.id, result.submissionId))!;
}

beforeAll(async () => {
  await resetDatabase();
  adminId = (await createUser(["ADMIN"], "admin@test.example")).id;
  await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), adminId);
  for (const [type, file] of [
    ["CODING_PROBLEMS", "coding/coding-problems.csv"],
    ["CODING_TESTCASES", "coding/coding-testcases.csv"],
    ["CODING_SOLUTIONS", "coding/coding-solutions.csv"],
  ] as const) {
    const batch = await importFile(type, file, await template(file), adminId);
    expect(batch.status, `${file}: ${batch.error}`).toBe("COMPLETED");
  }
  await drainJobs(); // problem.validate jobs queued by the imports
  const user = await db.user.create({
    data: {
      name: "Coder",
      email: "coder@test.example",
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

beforeEach(async () => {
  await db.submission.deleteMany();
  await db.problemProgress.deleteMany();
});

describe("importing and validating problems", () => {
  it("imports a problem as a draft and validates it in the judge", async () => {
    const p = await db.problem.findUniqueOrThrow({
      where: { externalId: "CODE-ARR-0001" },
      include: { testCases: true, solutions: true, topics: true },
    });
    expect(p.status).toBe("DRAFT");
    expect(p.testCases).toHaveLength(6);
    expect(p.testCases.filter((t) => t.isSample)).toHaveLength(1);
    expect(p.topics.map((t) => t.slug).sort()).toEqual(["arrays", "hashing"]);
    expect(p.validationNote).toContain("✓ reference (python)");
    expect(p.validationNote).toContain("✓ brute (python)");
    expect(p.validatedAt).not.toBeNull();
  });

  it("rejects a test file without enough hidden tests", async () => {
    const csv =
      'problem_id,order,is_sample,input,output,explanation\nCODE-ARR-0001,1,yes,"1 1\n1",NO,\n';
    const batch = await importFile("CODING_TESTCASES", "few.csv", strToU8(csv), adminId, {
      confirm: false,
    });
    const rows = await db.importRow.findMany({ where: { batchId: batch.id } });
    expect(rows.every((r) => r.status === "ERROR")).toBe(true);
    expect(JSON.stringify(rows[0]!.messages)).toContain("5 hidden");
  });

  it("marks a problem invalid when a reference solution is wrong", async () => {
    const csv = `problem_id,kind,language,code\nCODE-ARR-0001,reference,javascript,"console.log('NO')"\n`;
    const batch = await importFile("CODING_SOLUTIONS", "bad.csv", strToU8(csv), adminId);
    expect(batch.status).toBe("COMPLETED");
    await drainJobs();
    const p = await problem();
    expect(p.validatedAt).toBeNull();
    expect(p.validationNote).toMatch(/✗ reference \(javascript\): wrong answer on test 1/);
    // Fix it and it passes again.
    await db.problemSolution.deleteMany({ where: { problemId: p.id, language: "javascript" } });
    const fixed = `problem_id,kind,language,code\nCODE-ARR-0001,reference,cpp,"${CPP_SOLUTION.replaceAll('"', '""')}"\n`;
    await importFile("CODING_SOLUTIONS", "good.csv", strToU8(fixed), adminId);
    await drainJobs();
    const again = await problem();
    expect(again.validationNote).toContain("✓ reference (cpp)");
    expect(again.validatedAt).not.toBeNull();
  });

  it("imports a ZIP problem package", async () => {
    const problemCsv = (await template("coding/coding-problems.csv"))
      .toString("utf8")
      .replace("CODE-ARR-0001", "CODE-ARR-0002")
      .replace("pair-with-target-sum", "pair-with-target-sum-zip");
    const files: Record<string, Uint8Array> = {
      "pair-zip/problem.csv": strToU8(problemCsv),
      "pair-zip/tests/sample-1.in": strToU8("5 9\n2 7 11 15 1\n"),
      "pair-zip/tests/sample-1.out": strToU8("YES\n"),
      "pair-zip/solutions/reference.cpp": strToU8(CPP_SOLUTION),
      "pair-zip/starter/main.py": strToU8("# your code\n"),
    };
    for (let i = 1; i <= 5; i++) {
      files[`pair-zip/tests/${i}.in`] = strToU8(`2 ${i * 2}\n${i} ${i}\n`);
      files[`pair-zip/tests/${i}.out`] = strToU8("YES\n");
    }
    const batch = await importFile("CODING_PACKAGE", "pack.zip", zipSync(files), adminId);
    expect(batch.status, batch.error ?? "").toBe("COMPLETED");
    await drainJobs();
    const p = await db.problem.findUniqueOrThrow({
      where: { externalId: "CODE-ARR-0002" },
      include: { testCases: { orderBy: { order: "asc" } }, solutions: true },
    });
    expect(p.testCases).toHaveLength(6);
    expect(p.testCases[0]!.isSample).toBe(true);
    expect(p.solutions.map((s) => `${s.kind}:${s.language}`).sort()).toEqual([
      "REFERENCE:cpp",
      "STARTER:python",
    ]);
    expect(p.validatedAt).not.toBeNull();
  });
});

describe("solving problems", () => {
  beforeAll(async () => {
    const p = await problem();
    if (p.status !== "PUBLISHED") {
      expect(await transitionProblem(p.id, "publish", admin())).toEqual({ ok: true });
    }
  });

  it("won't publish a problem that hasn't passed validation", async () => {
    const p = await db.problem.create({
      data: {
        externalId: "CODE-X-1",
        slug: "x-1",
        title: "X",
        difficulty: "EASY",
        statement: "s",
        inputFormat: "i",
        outputFormat: "o",
        constraints: "c",
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        languages: ["python"],
      },
    });
    const result = await transitionProblem(p.id, "publish", admin());
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/judge/) });
    await db.problem.delete({ where: { id: p.id } });
  });

  it("runs samples and custom input, showing their data", async () => {
    const run = await submit(CPP_SOLUTION, "cpp", "RUN");
    expect(run.verdict).toBe("ACCEPTED");
    expect(run.results).toHaveLength(1);
    expect(run.results[0]).toMatchObject({ sample: true, expected: "YES", output: "YES\n" });

    const custom = await submit(CPP_SOLUTION, "cpp", "RUN", "2 3\n1 2\n");
    expect(custom.custom).toBe(true);
    expect(custom.results[0]?.output).toBe("YES\n");
    expect(custom.results[0]).not.toHaveProperty("expected");
  });

  it("judges a wrong submission without revealing hidden tests", async () => {
    const result = await submit(WRONG_PYTHON, "python", "SUBMIT");
    expect(result.verdict).toBe("WRONG_ANSWER");
    // All-or-nothing scoring stops at the first failure.
    expect(result.score).toBe(0);
    const hidden = result.results.filter((r) => !r.sample);
    expect(hidden.length).toBeGreaterThan(0);
    for (const r of hidden) {
      expect(r).not.toHaveProperty("input");
      expect(r).not.toHaveProperty("expected");
      expect(r).not.toHaveProperty("output");
    }
    const progress = await db.problemProgress.findFirstOrThrow({ where: { userId: student.id } });
    expect(progress).toMatchObject({ attempts: 1, solvedAt: null });
  });

  it("accepts a correct solution and records the solve", async () => {
    const result = await submit(CPP_SOLUTION, "cpp", "SUBMIT");
    expect(result).toMatchObject({ verdict: "ACCEPTED", testsPassed: 6, testsTotal: 6, score: 1 });
    const progress = await db.problemProgress.findFirstOrThrow({ where: { userId: student.id } });
    expect(progress.solvedAt).not.toBeNull();
    const mastery = await db.mastery.findMany({
      where: { userId: student.id },
      include: { topic: true },
    });
    expect(mastery.map((m) => m.topic.slug).sort()).toEqual(["arrays", "hashing"]);
    const list = await listProblems(student, { state: "solved" });
    expect(list.map((p) => p.slug)).toEqual(["pair-with-target-sum"]);
  });

  it("reports compile errors", async () => {
    const result = await submit("int main( {", "cpp", "SUBMIT");
    expect(result.verdict).toBe("COMPILATION_ERROR");
    expect(result.compileOutput).toBeTruthy();
  });

  it("allows one pending submission at a time", async () => {
    const p = await problem();
    const first = await createSubmission(student, {
      problemId: p.id,
      language: "python",
      code: "print(1)",
      kind: "RUN",
    });
    const second = await createSubmission(student, {
      problemId: p.id,
      language: "python",
      code: "print(1)",
      kind: "RUN",
    });
    expect(first.status).toBe("queued");
    expect(second.status).toBe("busy");
    await drainJobs();
  });

  it("rejects languages the problem doesn't allow", async () => {
    const p = await problem();
    await db.problem.update({ where: { id: p.id }, data: { languages: ["python"] } });
    const result = await createSubmission(student, {
      problemId: p.id,
      language: "cpp",
      code: "x",
      kind: "RUN",
    });
    expect(result.status).toBe("invalid");
    await db.problem.update({ where: { id: p.id }, data: { languages: p.languages } });
  });

  it("reveals hints one at a time, then the editorial", async () => {
    const p = await problem();
    let view = await getWorkspaceProblem(student, p.slug);
    expect(view?.hints).toEqual([]);
    expect(view?.editorial).toBeNull();
    expect(view?.editorialLocked).toBe(true);
    for (let i = 0; i < 3; i++) await revealHint(student, p.id);
    view = await getWorkspaceProblem(student, p.slug);
    expect(view?.hints).toHaveLength(3);
    expect(view?.editorial).toBeNull();
    await revealHint(student, p.id);
    view = await getWorkspaceProblem(student, p.slug);
    expect(view?.editorial).toContain("hash set");
  });

  it("doesn't judge twice when the job is retried", async () => {
    const result = await submit(CPP_SOLUTION, "cpp", "SUBMIT");
    await judgeSubmission(result.id);
    const progress = await db.problemProgress.findFirstOrThrow({ where: { userId: student.id } });
    expect(progress.attempts).toBe(1);
  });
});
