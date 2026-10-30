// Interview questions per company (D-067, step 2): design questions link to companies like
// questions and problems, can be tied to an interview round, and count in the checklist.

import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { getCompanyBySlug } from "@/server/services/companies";
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
    await setLinkRound(link.id, companyId, 2);

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
