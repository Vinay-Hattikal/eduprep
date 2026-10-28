// Loads every template in docs/templates through the real import pipeline, in dependency order
// (data-import.md section 3). Useful for development and as an end-to-end check of the importers.
//
//   npm run content:sample                       import as drafts
//   npm run content:sample -- --publish          also publish the sample content
//   npm run content:sample -- --reset-students   also reset the seeded test students
//
// Imported items are attributed to the seeded super admin. Safe to run again: unchanged rows are
// skipped. --publish goes through the normal review workflow (submit, then approve as the super
// admin, solo mode) so every step is in the audit log. Both flags refuse to run in production.

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ImportType } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { confirmBatch, createImportBatch } from "@/server/imports/pipeline";
import { drainJobs } from "@/server/jobs/runner";
import { istDay, addDays } from "@/lib/learning/dates";
import type { BlueprintForm } from "@/schemas/blueprint";
import { draftFromCompany, saveBlueprint, transitionBlueprint } from "@/server/services/blueprints";
import { setCompanyStatus } from "@/server/services/companies";
import { transitionProblem } from "@/server/services/problems";
import { transitionQuestion } from "@/server/services/questions";
import { publishContest, saveContest } from "@/server/services/contests";
import { savePosting, setPostingStatus } from "@/server/services/job-postings";

const args = new Set(process.argv.slice(2));
const PUBLISH = args.has("--publish");
const RESET_STUDENTS = args.has("--reset-students");
const STUDENT_EMAILS = [
  "fresher@example.com",
  "experienced@example.com",
  "new-student@example.com",
];

const TEMPLATES = path.resolve("docs/templates");

// The single-file formats (D-054), companies first: question and coding files name them.
const FILES: [ImportType, string][] = [
  ["TAXONOMY", "taxonomy.csv"],
  ["PASSAGES", "passages.csv"],
  ["COMPANIES", "companies/companies.csv"],
  ["COMPANY_PROCESS", "companies/company-process.csv"],
  ...[
    "quantitative-aptitude",
    "logical-reasoning",
    "verbal-ability",
    "data-interpretation",
    "operating-systems",
    "dbms",
    "computer-networks",
    "oops",
    "dsa",
    "programming-languages",
    "pseudocode",
  ].map((subject): [ImportType, string] => ["MCQ", `mcq/${subject}.csv`]),
  ["CODING_BUNDLE", "coding/coding-problems-single-file.csv"],
  // Optional extra: report counts and rounds for the company tags above.
  ["COMPANY_QUESTION_MAP", "companies/company-question-map.csv"],
  ["ROLE_TRACKS", "tracks/role-tracks.csv"],
  ["DESIGN_QUESTIONS", "design/design-questions.csv"],
];

async function main() {
  const admin = await db.user.findFirst({ where: { roles: { has: "SUPER_ADMIN" } } });
  if (!admin) throw new Error("No super admin found. Run `npm run db:seed` first.");

  if ((PUBLISH || RESET_STUDENTS) && process.env.APP_ENV === "production") {
    throw new Error("--publish and --reset-students are for development and tests only.");
  }

  let failures = 0;
  const batchIds: string[] = [];
  for (const [type, file] of FILES) {
    const data = await readFile(path.join(TEMPLATES, file));
    const batchId = await createImportBatch({
      type,
      fileName: path.basename(file),
      data,
      actorId: admin.id,
    });
    await drainJobs();

    batchIds.push(batchId);
    let batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    if (batch.status === "PREVIEW_READY" && batch.validRows + batch.warningRows > 0) {
      await confirmBatch(batchId, admin.id);
      await drainJobs();
      batch = await db.importBatch.findUniqueOrThrow({ where: { id: batchId } });
    }

    const ok = batch.status === "COMPLETED" && batch.failedCount === 0;
    if (!ok) failures += 1;
    console.log(
      `${ok ? "✓" : "✗"} ${file.padEnd(40)} ${batch.status.padEnd(14)} ` +
        `created ${batch.createdCount}, updated ${batch.updatedCount}, unchanged ${batch.unchangedCount}` +
        (batch.error ? ` (${batch.error})` : ""),
    );

    // Rows rejected at validation.
    const rejected = await db.importRow.findMany({
      where: { batchId, status: { in: ["ERROR", "FAILED"] } },
      orderBy: { rowNumber: "asc" },
    });
    for (const row of rejected) {
      const messages = (row.messages as { column?: string; message: string }[])
        .map((m) => (m.column ? `${m.column}: ${m.message}` : m.message))
        .join("; ");
      console.log(`    row ${row.rowNumber} skipped: ${messages}`);
    }
  }

  // Coding imports queue judge checks; run them before publishing.
  await drainJobs();
  if (PUBLISH) {
    await publishSampleContent(admin.id, batchIds);
    await publishSampleTests(admin.id);
    await publishSampleEngagement(admin.id);
  }
  if (RESET_STUDENTS) await resetStudents();

  await db.$disconnect();
  if (failures) {
    console.error(`${failures} file(s) didn't import cleanly. Open /admin/imports for details.`);
    process.exit(1);
  }
}

main().catch(async (error) => {
  console.error(error);
  await db.$disconnect();
  process.exit(1);
});

/** Publishes the questions and companies from the sample files through the review workflow. */
async function publishSampleContent(adminId: string, batchIds: string[]) {
  const actor = { id: adminId, roles: ["SUPER_ADMIN" as const] };
  const questionIds = (
    await db.importRow.findMany({
      where: { batchId: { in: batchIds }, status: "IMPORTED", batch: { type: "MCQ" } },
      select: { entityId: true },
    })
  ).map((row) => row.entityId!);

  let published = 0;
  for (const question of await db.question.findMany({ where: { id: { in: questionIds } } })) {
    if (question.status === "PUBLISHED") continue;
    if (question.status === "ARCHIVED") await transitionQuestion(question.id, "restore", actor);
    if (question.status !== "IN_REVIEW") await transitionQuestion(question.id, "submit", actor);
    const result = await transitionQuestion(question.id, "approve", actor);
    if (result.ok) published += 1;
    else console.warn(`    could not publish ${question.externalId}: ${result.error}`);
  }

  const companyIds = (
    await db.importRow.findMany({
      where: { batchId: { in: batchIds }, status: "IMPORTED", batch: { type: "COMPANIES" } },
      select: { entityId: true },
    })
  ).map((row) => row.entityId!);
  const admin = await db.user.findUniqueOrThrow({ where: { id: adminId } });
  const currentUser = {
    id: admin.id,
    name: admin.name,
    email: admin.email,
    roles: admin.roles,
    profileType: admin.profileType,
    onboarded: true,
  };
  for (const company of await db.company.findMany({ where: { id: { in: companyIds } } })) {
    if (company.status === "PUBLISHED") continue;
    if (company.status === "ARCHIVED") await setCompanyStatus(company.id, "restore", currentUser);
    await setCompanyStatus(company.id, "publish", currentUser);
  }
  let problems = 0;
  for (const problem of await db.problem.findMany({ where: { status: { not: "PUBLISHED" } } })) {
    if (!problem.validatedAt) {
      console.warn(
        `    ${problem.externalId} didn't pass the judge check: ${problem.validationNote ?? "not checked"}`,
      );
      continue;
    }
    if (problem.status === "ARCHIVED") await transitionProblem(problem.id, "restore", actor);
    if (problem.status !== "IN_REVIEW") await transitionProblem(problem.id, "submit", actor);
    if ((await transitionProblem(problem.id, "approve", actor)).ok) problems += 1;
  }
  const design = await db.designQuestion.updateMany({
    where: { status: "DRAFT" },
    data: { status: "PUBLISHED" },
  });
  console.log(
    `Published ${published} question(s), ${problems} coding problem(s), ${design.count} design question(s) and ${companyIds.length} sample compan${companyIds.length === 1 ? "y" : "ies"}.`,
  );
}

/**
 * Sample mock tests. The sample files hold only a few questions per topic, so each rule is
 * capped to what can really be drawn (every item once per sitting) and empty sections dropped.
 */
async function publishSampleTests(adminId: string) {
  const actor = { id: adminId, roles: ["SUPER_ADMIN" as const] };
  const topicIds = async (slugs: string[]) =>
    (await db.topic.findMany({ where: { slug: { in: slugs } }, select: { id: true } })).map(
      (t) => t.id,
    );

  async function feasible(form: BlueprintForm): Promise<BlueprintForm> {
    const sections = [];
    for (const section of form.sections) {
      const taken = new Set<string>();
      const rules = [];
      for (const rule of section.rules) {
        const ids =
          section.type === "MCQ"
            ? await db.question.findMany({
                where: {
                  status: "PUBLISHED",
                  topicId: rule.topicId,
                  ...(rule.difficulty && { difficulty: rule.difficulty }),
                },
                select: { id: true },
              })
            : await db.problem.findMany({
                where: {
                  status: "PUBLISHED",
                  validatedAt: { not: null },
                  topics: { some: { id: rule.topicId } },
                },
                select: { id: true },
              });
        const fresh = ids.map((x) => x.id).filter((id) => !taken.has(id));
        const count = Math.min(rule.count, fresh.length);
        fresh.slice(0, count).forEach((id) => taken.add(id));
        if (count > 0) rules.push({ ...rule, count });
      }
      const items = rules.reduce((n, r) => n + r.count, 0);
      if (items)
        sections.push({
          ...section,
          rules,
          minutes: Math.max(2, Math.min(section.minutes, items * 2)),
        });
    }
    // Rules sharing a topic across sections draw from the same pool: keep it simple and let
    // publishing report anything left over.
    return { ...form, sections };
  }

  async function upsert(form: BlueprintForm) {
    const existing = await db.testBlueprint.findUnique({
      where: { slug: form.slug },
      select: { id: true },
    });
    const ready = await feasible({ ...form, id: existing?.id });
    if (!ready.sections.length) return console.warn(`    ${form.slug}: nothing to draw yet`);
    const saved = await saveBlueprint(ready, actor);
    if (!saved.ok) return console.warn(`    ${form.slug}: ${JSON.stringify(saved.fieldErrors)}`);
    const published = await transitionBlueprint(saved.id, "publish", actor);
    console.log(
      `${published.ok ? "✓" : "✗"} test ${form.slug}${published.ok ? "" : `: ${published.errors.join("; ")}`}`,
    );
  }

  const aptitude = await topicIds([
    "percentages",
    "averages",
    "time-work",
    "number-series",
    "blood-relations",
    "syllogism",
  ]);
  await upsert({
    title: "Aptitude quick test",
    slug: "aptitude-quick-test",
    kind: "TOPIC",
    platformStyle: "GENERIC",
    navigation: "FREE",
    description: "Quant and reasoning in one short timed test, with negative marking.",
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
        rules: aptitude.map((topicId) => ({ topicId, difficulty: null, count: 1 })),
      },
    ],
  });

  const arrays = await topicIds(["arrays"]);
  await upsert({
    title: "Coding round practice",
    slug: "coding-round-practice",
    kind: "OA",
    platformStyle: "HACKERRANK",
    navigation: "FREE",
    description: "One problem, 45 minutes, judged on hidden tests like an online assessment.",
    instructions: null,
    companyId: null,
    sections: [
      {
        name: "Coding",
        type: "CODING",
        minutes: 45,
        marksPerItem: 20,
        negativeMarks: 0,
        canGoBack: true,
        rules: arrays.map((topicId) => ({ topicId, difficulty: null, count: 1 })),
      },
    ],
  });

  const acme = await db.company.findUnique({ where: { slug: "acme-tech" }, select: { id: true } });
  const draft = acme ? await draftFromCompany(acme.id) : null;
  if (draft) await upsert({ ...draft, platformStyle: "TCS_ION" });
}

/**
 * A live All-India mock (open for a week from now, on the aptitude quick test's format) and two
 * sample jobs, one linked to the sample company. Safe to run again.
 */
async function publishSampleEngagement(adminId: string) {
  const actor = { id: adminId };
  const format = await db.testBlueprint.findUnique({
    where: { slug: "aptitude-quick-test" },
    select: { id: true },
  });
  if (format) {
    const slug = "all-india-mock-sample";
    const now = Date.now();
    const existing = await db.contest.findUnique({ where: { slug } });
    if (existing && existing.status === "PUBLISHED") {
      // Keep it open: move the window, not the frozen questions.
      await db.contest.update({
        where: { slug },
        data: {
          startsAt: new Date(now - 3_600_000),
          endsAt: new Date(now + 7 * 86_400_000),
          finalizedAt: null,
        },
      });
    } else {
      const saved = await saveContest(
        {
          id: existing?.id,
          slug,
          title: "All-India Mock (sample)",
          description: "The same questions for everyone, ranked live.",
          blueprintId: format.id,
          startsAt: new Date(now - 3_600_000),
          endsAt: new Date(now + 7 * 86_400_000),
        },
        actor,
      );
      if (saved.ok) {
        const published = await publishContest(saved.id, actor);
        console.log(
          `${published.ok ? "✓" : "✗"} contest ${slug}${published.ok ? "" : `: ${published.error}`}`,
        );
      }
    }
  }

  const acme = await db.company.findUnique({ where: { slug: "acme-tech" }, select: { id: true } });
  const jobs = [
    {
      title: "Graduate Engineer Trainee",
      companyId: acme?.id ?? null,
      companyName: "Acme Technologies (EXAMPLE)",
      locations: ["Bengaluru", "Pune"],
      workMode: "HYBRID" as const,
      jobType: "FULL_TIME" as const,
      audience: ["FRESHER" as const],
      minExperience: 0,
      maxExperience: 0,
      salary: "4–6 LPA",
      skills: ["Java", "SQL", "Aptitude"],
      description:
        "**Example job.** Join the engineering programme: six months of training, then a product team.\n\n**Selection:** online test, technical interview, HR interview.",
      branches: ["CSE", "IT", "ECE"],
      gradYears: [2026],
      minCgpa: 6,
      maxBacklogs: 0,
      applyUrl: "https://example.com/careers/get",
      applyBy: null,
    },
    {
      title: "Data Analyst Intern",
      companyId: null,
      companyName: "Globex Analytics (EXAMPLE)",
      locations: ["Remote"],
      workMode: "REMOTE" as const,
      jobType: "INTERNSHIP" as const,
      audience: ["FRESHER" as const],
      minExperience: null,
      maxExperience: null,
      salary: "₹20,000 a month",
      skills: ["SQL", "Excel", "Python"],
      description: "**Example job.** Six-month internship with the analytics team.",
      branches: [],
      gradYears: [],
      minCgpa: null,
      maxBacklogs: null,
      applyUrl: "https://example.com/careers/intern",
      applyBy: null,
    },
  ];
  for (const job of jobs) {
    const existing = await db.jobPosting.findFirst({
      where: { title: job.title, companyName: job.companyName },
      select: { id: true, status: true },
    });
    const saved = await savePosting({ ...job, id: existing?.id }, actor);
    if (saved.ok && existing?.status !== "PUBLISHED")
      await setPostingStatus(saved.id, "publish", actor);
  }
  console.log(`✓ ${jobs.length} sample jobs`);
}

/** Puts the seeded students back to a known state for demos and end-to-end tests. */
async function resetStudents() {
  const students = await db.user.findMany({ where: { email: { in: STUDENT_EMAILS } } });
  const ids = students.map((s) => s.id);
  // Interviews and purchases (Phase 5): the seeded interviewer starts clean too.
  const interviewer = await db.user.findUnique({ where: { email: "interviewer@example.com" } });
  await db.$transaction([
    db.payoutEntry.deleteMany({ where: { interviewerId: interviewer?.id ?? "" } }),
    db.payout.deleteMany({ where: { interviewerId: interviewer?.id ?? "" } }),
    db.interviewCredit.deleteMany({ where: { userId: { in: ids } } }),
    db.booking.deleteMany({ where: { candidateId: { in: ids } } }),
    db.entitlement.deleteMany({ where: { userId: { in: ids } } }),
    db.order.deleteMany({ where: { userId: { in: ids } } }),
    db.experience.deleteMany({ where: { userId: { in: ids } } }),
    db.referralCode.deleteMany({ where: { userId: { in: ids } } }),
    // Sign-in rate limits: e2e runs all come from one IP.
    db.rateLimit.deleteMany(),
    db.interviewer.updateMany({
      where: { userId: interviewer?.id ?? "" },
      data: { ratingSum: 0, ratingCount: 0, noShows: 0, flaggedAt: null },
    }),
  ]);
  await db.$transaction([
    db.attempt.deleteMany({ where: { userId: { in: ids } } }),
    db.mastery.deleteMany({ where: { userId: { in: ids } } }),
    db.mistake.deleteMany({ where: { userId: { in: ids } } }),
    db.bookmark.deleteMany({ where: { userId: { in: ids } } }),
    db.userStats.deleteMany({ where: { userId: { in: ids } } }),
    db.errorReport.deleteMany({ where: { userId: { in: ids } } }),
    db.companyRequest.deleteMany({ where: { userId: { in: ids } } }),
    db.targetCompany.deleteMany({ where: { userId: { in: ids } } }),
    db.testSitting.deleteMany({ where: { userId: { in: ids } } }),
    db.submission.deleteMany({ where: { userId: { in: ids } } }),
    db.problemProgress.deleteMany({ where: { userId: { in: ids } } }),
    // Phase 7: badges, shares, saved jobs, drive reports and discussions.
    db.userBadge.deleteMany({ where: { userId: { in: ids } } }),
    db.shareCard.deleteMany({ where: { userId: { in: ids } } }),
    db.jobSave.deleteMany({ where: { userId: { in: ids } } }),
    db.jobApplyClick.deleteMany({ where: { userId: { in: ids } } }),
    db.driveReport.deleteMany({ where: { userId: { in: ids } } }),
    db.questionComment.deleteMany({ where: { userId: { in: ids } } }),
    db.commentVote.deleteMany({ where: { userId: { in: ids } } }),
    db.commentFlag.deleteMany({ where: { userId: { in: ids } } }),
    db.user.updateMany({ where: { id: { in: ids } }, data: { commentsBlockedAt: null } }),
    // Job postings made by end-to-end tests.
    db.jobPosting.deleteMany({ where: { title: { startsWith: "E2E " } } }),
  ]);

  // The new student goes through onboarding again.
  const newStudent = students.find((s) => s.email === "new-student@example.com");
  if (newStudent) {
    await db.fresherProfile.deleteMany({ where: { userId: newStudent.id } });
    await db.experiencedProfile.deleteMany({ where: { userId: newStudent.id } });
    await db.user.update({
      where: { id: newStudent.id },
      data: { onboardedAt: null, profileType: null, preferredLanguage: null, name: "Neha New" },
    });
  }

  // The fresher prepares for the sample company, with a drive in 30 days.
  const fresher = students.find((s) => s.email === "fresher@example.com");
  const sample = await db.company.findFirst({ where: { slug: "acme-tech", status: "PUBLISHED" } });
  if (fresher && sample) {
    await db.targetCompany.create({
      data: { userId: fresher.id, companyId: sample.id, targetDate: addDays(istDay(), 30) },
    });
  }
  console.log(`Reset ${students.length} seeded student(s).`);
}
