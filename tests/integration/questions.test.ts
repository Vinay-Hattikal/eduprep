import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import type { QuestionFormValues } from "@/schemas/question";
import { saveQuestion, transitionQuestion } from "@/server/services/questions";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let author: { id: string; roles: ["CONTENT_AUTHOR"] };
let reviewer: { id: string; roles: ["REVIEWER"] };
let form: QuestionFormValues;

beforeAll(async () => {
  await resetDatabase();
  const admin = await createUser(["SUPER_ADMIN"], "admin@test.example");
  author = {
    id: (await createUser(["CONTENT_AUTHOR"], "author@test.example")).id,
    roles: ["CONTENT_AUTHOR"],
  };
  reviewer = {
    id: (await createUser(["REVIEWER"], "reviewer@test.example")).id,
    roles: ["REVIEWER"],
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

  it("runs the review workflow with blind review and notes", async () => {
    const question = await db.question.findUniqueOrThrow({ where: { externalId: "QA-AVG-9001" } });

    expect(await transitionQuestion(question.id, "approve", reviewer)).toMatchObject({ ok: false });
    expect(await transitionQuestion(question.id, "submit", author)).toEqual({ ok: true });
    expect(await transitionQuestion(question.id, "approve", author)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/reviewers/),
    });
    expect(await transitionQuestion(question.id, "reject", reviewer)).toMatchObject({
      ok: false,
      error: /Say what/,
    });
    expect(
      await transitionQuestion(question.id, "reject", reviewer, "Option C is ambiguous"),
    ).toEqual({ ok: true });
    expect(await db.question.findUniqueOrThrow({ where: { id: question.id } })).toMatchObject({
      status: "DRAFT",
      reviewNote: "Option C is ambiguous",
    });

    await transitionQuestion(question.id, "submit", author);
    expect(await transitionQuestion(question.id, "approve", reviewer)).toEqual({ ok: true });
    const published = await db.question.findUniqueOrThrow({ where: { id: question.id } });
    expect(published).toMatchObject({
      status: "PUBLISHED",
      reviewerId: reviewer.id,
      reviewNote: null,
    });
    expect(published.publishedAt).toBeInstanceOf(Date);

    // Editing a published question sends it back to draft.
    const edited = await saveQuestion(
      { ...form, id: question.id, text: "Average of 2, 4, 6?" },
      author,
    );
    expect(edited).toMatchObject({ ok: true, movedToDraft: true });
    expect((await db.question.findUniqueOrThrow({ where: { id: question.id } })).status).toBe(
      "DRAFT",
    );

    const audit = await db.auditLog.findMany({
      where: { entityId: question.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        "question.create",
        "question.submit",
        "question.reject",
        "question.approve",
        "question.update",
      ]),
    );
  });
});
