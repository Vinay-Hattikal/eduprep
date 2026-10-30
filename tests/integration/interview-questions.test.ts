// Interview questions per company (D-067, step 2): design questions link to companies like
// questions and problems, can be tied to an interview round, and count in the checklist.

import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { confirmBatch } from "@/server/imports/pipeline";
import { drainJobs } from "@/server/jobs/runner";
import { getCompanyBySlug } from "@/server/services/companies";
import { copyHiringPattern, deleteRound, moveRound } from "@/server/services/company-hiring";
import { linkToCompany, setLinkRound } from "@/server/services/company-links";
import { publishCompanyContent } from "@/server/services/company-publish";
import { companyReadiness } from "@/server/services/company-readiness";
import { saveDesignQuestion, type DesignValues } from "@/server/services/design-questions";
import { getDesignQuestion, listDesignQuestions } from "@/server/services/tracks";
import { createUser, importFile, resetDatabase, template } from "./helpers";

let admin: { id: string; roles: "ADMIN"[] };
let companyId: string;

const values = (overrides: Partial<DesignValues> = {}): DesignValues => ({
  externalId: "HR-IQ-0001",
  slug: "tell-me-about-a-conflict",
  kind: "HR",
  title: "Tell me about a conflict in a team",
  difficulty: "EASY",
  prompt: "Tell me about a time you disagreed with a teammate.",
  requirements: "A real example, what you did, what you learned.",
  approach: "Use situation, task, action, result.",
  tradeoffs: "Blaming others; no outcome.",
  followUps: null,
  companies: ["iq-co"],
  tracks: [],
  ...overrides,
});

beforeAll(async () => {
  await resetDatabase();
  admin = { id: (await createUser(["ADMIN"], "admin@test.example")).id, roles: ["ADMIN"] };
  const company = await db.company.create({
    data: {
      slug: "iq-co",
      name: "IQ Co",
      level: "STANDARD",
      category: "PRODUCT",
      hiringFor: ["FRESHER"],
      overview:
        "A product company with a technical interview and an HR round after an online coding test.",
      lastVerifiedAt: new Date(),
      status: "PUBLISHED",
      sources: {
        create: { label: "Careers", url: "https://example.com/iq", checkedOn: new Date() },
      },
      rounds: {
        create: [
          { order: 1, name: "Technical interview", type: "TECHNICAL_INTERVIEW" },
          { order: 2, name: "HR", type: "HR_INTERVIEW" },
        ],
      },
    },
  });
  companyId = company.id;
});

describe("interview questions", () => {
  it("links a question to the companies named in the editor, without leaving draft for it", async () => {
    const saved = await saveDesignQuestion(values(), admin);
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const link = await db.companyItem.findFirstOrThrow({
      where: { companyId, designQuestionId: saved.id },
    });
    const hr = await db.companyRound.findFirstOrThrow({ where: { companyId, order: 2 } });
    expect(await setLinkRound(link.id, companyId, hr.id, admin)).toBe(true);
    // Not a round of this company.
    expect(await setLinkRound(link.id, companyId, "no-such-round", admin)).toBe(false);

    const r = await companyReadiness((await getCompanyBySlug("iq-co"))!);
    expect(r.items.find((i) => i.key === "interview")).toMatchObject({
      done: false,
      detail: "0 published, 1 draft",
    });

    const result = await publishCompanyContent(companyId, admin);
    expect(result).toMatchObject({ interviews: 1 });
    const after = await companyReadiness((await getCompanyBySlug("iq-co"))!);
    expect(after.items.find((i) => i.key === "interview")?.done).toBe(true);

    // Students find it by company, and its page names the company.
    const student = { id: admin.id, roles: ["STUDENT" as const] };
    expect((await listDesignQuestions(student, { company: "iq-co" })).map((q) => q.slug)).toEqual([
      "tell-me-about-a-conflict",
    ]);
    expect((await getDesignQuestion(student, "tell-me-about-a-conflict"))?.companyRefs).toEqual([
      { name: "IQ Co", slug: "iq-co" },
    ]);

    // Removing the company in the editor removes the link; the round goes with it.
    const edited = await saveDesignQuestion(values({ id: saved.id, companies: [] }), admin);
    expect(edited).toMatchObject({ ok: true, movedToDraft: false });
    expect(await db.companyItem.count({ where: { designQuestionId: saved.id } })).toBe(0);
    await linkToCompany(companyId, { designQuestionId: saved.id }, admin);
    expect(await db.companyItem.count({ where: { designQuestionId: saved.id } })).toBe(1);
  });

  it("imports link the companies a row names and keep links added by hand", async () => {
    const csv = (await template("design/design-questions.csv"))
      .toString()
      .replace(/,acme-tech,/g, ",iq-co,");
    const batch = await importFile(
      "DESIGN_QUESTIONS",
      "design/design-questions.csv",
      Buffer.from(csv),
      admin.id,
    );
    expect(batch.status).toBe("COMPLETED");
    const linked = await db.companyItem.count({
      where: { companyId, designQuestionId: { not: null } },
    });
    expect(linked).toBeGreaterThan(1);
  });

  it("imports for a company: empty cells get it, files without the column add it", async () => {
    await importFile("TAXONOMY", "taxonomy.csv", await template("taxonomy.csv"), admin.id);
    const other = await db.company.create({
      data: {
        slug: "other-co",
        name: "Other",
        level: "STANDARD",
        category: "SERVICE",
        hiringFor: ["FRESHER"],
        overview: "Example.",
        lastVerifiedAt: new Date(),
      },
    });
    const head =
      "external_id,subject,topic,type,question,option_a,option_b,correct,explanation,difficulty,expected_time_sec,source";
    const row = (id: string) =>
      `${id},quantitative-aptitude,percentages,single,What is 10% of ${id.slice(-1)}00?,1,2,A,Because.,easy,30,original`;

    // An empty companies cell means the import's company; a named one stays as written.
    const withColumn = [
      `${head},companies`,
      `${row("QA-IMP-0001")},`,
      `${row("QA-IMP-0002")},other-co`,
    ].join("\n");
    await importFile("MCQ", "mcq.csv", Buffer.from(withColumn), admin.id, { companyId });
    const links = async (externalId: string) =>
      (
        await db.companyItem.findMany({
          where: { question: { externalId } },
          select: { companyId: true },
        })
      )
        .map((l) => l.companyId)
        .sort();
    expect(await links("QA-IMP-0001")).toEqual([companyId]);
    expect(await links("QA-IMP-0002")).toEqual([other.id]);

    // No companies column: every row gets the company, and keeps the links it had.
    const withoutColumn = [head, row("QA-IMP-0002"), row("QA-IMP-0003")].join("\n");
    await importFile("MCQ", "mcq.csv", Buffer.from(withoutColumn), admin.id, { companyId });
    expect(await links("QA-IMP-0002")).toEqual([companyId, other.id].sort());
    expect(await links("QA-IMP-0003")).toEqual([companyId]);
  });
});

describe("copying a hiring pattern", () => {
  it("copies rounds, sections, eligibility and pay, never sources, into an empty company", async () => {
    const from = await db.company.findUniqueOrThrow({ where: { slug: "iq-co" } });
    await db.company.update({ where: { id: from.id }, data: { minCgpa: 7, ctcFresher: "6 LPA" } });
    const to = await db.company.create({
      data: {
        slug: "iq-sister",
        name: "IQ Sister",
        level: "STANDARD",
        category: "PRODUCT",
        hiringFor: ["FRESHER"],
        overview: "A sister company.",
        lastVerifiedAt: new Date(),
      },
    });
    const copied = await copyHiringPattern(
      from.id,
      to.id,
      { rounds: true, eligibility: true, pay: false },
      admin,
    );
    expect(copied).toEqual({ ok: true, slug: "iq-sister" });
    const after = await db.company.findUniqueOrThrow({
      where: { id: to.id },
      include: { rounds: { orderBy: { order: "asc" } }, sources: true },
    });
    expect(after.rounds.map((r) => [r.order, r.type])).toEqual([
      [1, "TECHNICAL_INTERVIEW"],
      [2, "HR_INTERVIEW"],
    ]);
    expect(after).toMatchObject({ minCgpa: 7, ctcFresher: null, sources: [] });

    // A second copy would mix two patterns.
    expect(
      await copyHiringPattern(
        from.id,
        to.id,
        { rounds: true, eligibility: false, pay: false },
        admin,
      ),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/already has rounds/) });
  });
});

describe("review fixes", () => {
  it("re-importing an unchanged design file keeps published questions live", async () => {
    // The template names acme-tech; an unknown company is an error, as in question files.
    await db.company.upsert({
      where: { slug: "acme-tech" },
      update: {},
      create: {
        slug: "acme-tech",
        name: "Acme",
        level: "STANDARD",
        category: "SERVICE",
        hiringFor: ["FRESHER"],
        overview: "Example.",
        lastVerifiedAt: new Date(),
      },
    });
    const file = await template("design/design-questions.csv");
    await importFile("DESIGN_QUESTIONS", "design.csv", file, admin.id, { publish: true });
    const question = await db.designQuestion.findUniqueOrThrow({
      where: { externalId: "SD-0001" },
    });
    await db.designQuestion.update({ where: { id: question.id }, data: { status: "PUBLISHED" } });
    // A link added in the admin panel, which the file's companies column doesn't list: the
    // column is the full list (D-054), so the preview warns and the link goes, but the
    // question itself is unchanged and stays live.
    await linkToCompany(companyId, { designQuestionId: question.id }, admin);
    const again = await importFile("DESIGN_QUESTIONS", "design.csv", file, admin.id, {
      confirm: false,
    });
    const row = await db.importRow.findFirstOrThrow({
      where: { batchId: again.id, entityId: question.id },
    });
    expect(JSON.stringify(row.messages)).toMatch(/Unlinks iq-co/);
    await confirmBatch(again.id, admin.id);
    await drainJobs();
    expect(
      await db.companyItem.count({ where: { designQuestionId: question.id, companyId } }),
    ).toBe(0);
    expect((await db.designQuestion.findUniqueOrThrow({ where: { id: question.id } })).status).toBe(
      "PUBLISHED",
    );
  });

  it("interview questions follow their round when rounds move or one is deleted", async () => {
    const company = await db.company.findUniqueOrThrow({
      where: { slug: "iq-co" },
      include: { rounds: { orderBy: { order: "asc" } } },
    });
    const hr = company.rounds[1];
    const link = await db.companyItem.findFirstOrThrow({
      where: { companyId: company.id, designQuestionId: { not: null } },
    });
    await db.companyItem.update({ where: { id: link.id }, data: { roundId: hr!.id } });
    await moveRound(hr!.id, "up", admin);
    const moved = await db.companyItem.findUniqueOrThrow({ where: { id: link.id } });
    expect(moved.roundId).toBe(hr!.id);
    await deleteRound(hr!.id, admin);
    expect((await db.companyItem.findUniqueOrThrow({ where: { id: link.id } })).roundId).toBeNull();
  });
});
