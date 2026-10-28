import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { QuestionFormValues } from "@/schemas/question";
import { saveQuestion, transitionQuestion } from "@/server/services/questions";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let author: { id: string; roles: ["ADMIN"] };
let reviewer: { id: string; roles: ["ADMIN"] };
let form: QuestionFormValues;

beforeAll(async () => {
  await resetDatabase();
  const admin = await createUser(["ADMIN"], "admin@test.example");
  author = {
    id: (await createUser(["ADMIN"], "author@test.example")).id,
    roles: ["ADMIN"],
  };
  reviewer = {
    id: (await createUser(["ADMIN"], "reviewer@test.example")).id,
    roles: ["ADMIN"],
  };
  await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), admin.id);

  const topic = await db.topic.findUniqueOrThrow({ where: { slug: "averages" } });
  form = {
    externalId: "QA-AVG-9001",
    subjectId: topic.subjectId,
    topicId: topic.id,
    subtopicId: null,
    type: "SINGLE",
    text: "The average of 2, 4 and 6 is?",
    code: null,
    codeLanguage: null,
    options: ["3", "4", "5", "", ""],
    correctOptions: ["B"],
    numericAnswer: null,
    tolerance: null,
    explanation: "Sum is 12 and there are 3 numbers, so 12 / 3 = 4.",
    difficulty: "EASY",
    expectedTimeSec: 30,
    passageExternalId: null,
    tags: ["basics"],
    source: "ORIGINAL",
  };
});

describe("question editing and review", () => {
  it("creates a draft, rejects bad input, and versions every change", async () => {
    const bad = await saveQuestion({ ...form, correctOptions: ["D"] }, author);
    expect(bad).toMatchObject({
      ok: false,
      fieldErrors: { correctOptions: expect.stringMatching(/empty option/) },
    });

    const created = await saveQuestion(form, author);
    if (!created.ok) throw new Error("expected success");
    const duplicate = await saveQuestion(form, author);
    expect(duplicate).toMatchObject({
      ok: false,
      fieldErrors: { externalId: "This ID is already used." },
    });

    const unchanged = await saveQuestion({ ...form, id: created.id }, author);
    expect(unchanged).toMatchObject({ ok: true, movedToDraft: false });
    expect(await db.contentVersion.count({ where: { entityId: created.id } })).toBe(1);

    await saveQuestion({ ...form, id: created.id, difficulty: "MEDIUM" }, author);
    const question = await db.question.findUniqueOrThrow({ where: { id: created.id } });
    expect(question).toMatchObject({
      version: 2,
      difficulty: "MEDIUM",
      status: "DRAFT",
      authorId: author.id,
    });
  });

  it("publishes, unpublishes, archives and restores without a review step", async () => {
    const question = await db.question.findUniqueOrThrow({ where: { externalId: "QA-AVG-9001" } });

    // The author publishes their own question (D-056: one admin role, no review).
    expect(await transitionQuestion(question.id, "publish", author)).toEqual({ ok: true });
    const published = await db.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(published).toMatchObject({ status: "PUBLISHED", reviewerId: author.id });
    expect(published.publishedAt).toBeInstanceOf(Date);
    expect(await transitionQuestion(question.id, "publish", author)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Can't publish/),
    });

    // Students can't publish.
    const student = { id: author.id, roles: ["STUDENT" as const] };
    expect(await transitionQuestion(question.id, "unpublish", student)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Only admins/),
    });

    // A plain save of a published question unpublishes it.
    const edited = await saveQuestion(
      { ...form, id: question.id, text: "Average of 2, 4, 6?" },
      author,
    );
    expect(edited).toMatchObject({ ok: true, movedToDraft: true });
    expect((await db.question.findUniqueOrThrow({ where: { id: question.id } })).status).toBe(
      "DRAFT",
    );

    expect(await transitionQuestion(question.id, "archive", reviewer)).toEqual({ ok: true });
    expect(await transitionQuestion(question.id, "restore", reviewer)).toEqual({ ok: true });

    const audit = await db.auditLog.findMany({
      where: { entityId: question.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "question.create",
        "question.publish",
        "question.update",
        "question.archive",
        "question.restore",
      ]),
    );
  });

  it("won't publish a question that fails the automatic checks", async () => {
    const topic = await db.topic.findUniqueOrThrow({ where: { slug: "averages" } });
    const broken = await db.question.create({
      data: {
        externalId: "QA-AVG-9002",
        subjectId: topic.subjectId,
        topicId: topic.id,
        type: "SINGLE",
        text: "Pick one",
        options: ["1", "2"],
        correctOptions: ["C"],
        explanation: "",
        difficulty: "EASY",
        expectedTimeSec: 30,
      },
    });
    expect(await transitionQuestion(broken.id, "publish", author)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/automatic checks/),
    });
  });
});
