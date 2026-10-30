import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { EMPTY_QUESTION, taxonomyOptions } from "@/app/admin/questions/editor-data";
import { QuestionEditor } from "@/app/admin/questions/question-editor";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { companyOptions, suggestNextQuestionId } from "@/server/services/company-links";

export const metadata: Metadata = { title: "New question" };

export default function NewQuestionPage({ searchParams }: PageProps<"/admin/questions/new">) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageSkeleton />}>
        <NewQuestion searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const param = (value: string | string[] | undefined) =>
  typeof value === "string" ? value.slice(0, 80) : undefined;

/**
 * A blank question, or (company-wise entry, D-057):
 * - `?company=<slug>`: tagged with that company, back link to its Questions tab;
 * - `?topic=<id>`: that subject and topic picked (the company page's coverage links, D-067);
 * - `?fromReport=<id>`: the text and company of a drive report (Community tab, D-067);
 * - `?copyFrom=<id>`: "Then add another": same subject, topic, type, difficulty, source and
 *   companies as the question just saved, with the next ID suggested.
 */
async function NewQuestion({
  searchParams,
}: {
  searchParams: PageProps<"/admin/questions/new">["searchParams"];
}) {
  await requirePermission("content.edit");
  const query = await searchParams;
  const [taxonomy, companies] = await Promise.all([taxonomyOptions(), companyOptions()]);

  const copyFromId = param(query.copyFrom);
  const previous = copyFromId
    ? await db.question.findUnique({
        where: { id: copyFromId },
        include: { companies: { select: { companyId: true, askedIn: true } } },
      })
    : null;
  const companySlug = param(query.company);
  const company = companySlug ? companies.find((c) => c.slug === companySlug) : undefined;

  const initial = { ...EMPTY_QUESTION };
  const topicId = param(query.topic);
  const subject = topicId && taxonomy.find((s) => s.topics.some((t) => t.id === topicId));
  if (subject) Object.assign(initial, { subjectId: subject.id, topicId });
  let initialCompanies = company ? [{ companyId: company.id, askedIn: "" }] : [];
  if (previous) {
    Object.assign(initial, {
      externalId: await suggestNextQuestionId(previous.externalId),
      subjectId: previous.subjectId,
      topicId: previous.topicId,
      subtopicId: previous.subtopicId ?? "",
      type: previous.type,
      difficulty: previous.difficulty,
      expectedTimeSec: String(previous.expectedTimeSec),
      source: previous.source,
      tags: previous.tags.join(", "),
    });
    initialCompanies = previous.companies.map((c) => ({
      companyId: c.companyId,
      askedIn: c.askedIn.join(", "),
    }));
  }
  // "Turn into a question" from a drive report (D-067): what the student reported, asked at
  // that company in the drive's month.
  const reportId = param(query.fromReport);
  const report = reportId
    ? await db.driveReport.findUnique({
        where: { id: reportId },
        select: { questions: true, driveDate: true, companyId: true },
      })
    : null;
  if (report) {
    initial.text = report.questions;
    initialCompanies = [
      { companyId: report.companyId, askedIn: report.driveDate.toISOString().slice(0, 7) },
    ];
  }
  // Where "back" goes: the company the questions are being written for, if any.
  const backCompany =
    company ??
    (previous?.companies.length === 1
      ? companies.find((c) => c.id === previous.companies[0]!.companyId)
      : undefined);

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="-ml-2 max-w-full">
        <Link
          href={
            backCompany ? `/admin/companies/${backCompany.slug}?tab=questions` : "/admin/questions"
          }
        >
          <ArrowLeft />
          <span className="truncate">
            {backCompany ? `${backCompany.name} questions` : "Questions"}
          </span>
        </Link>
      </Button>
      <PageHeader
        title={backCompany ? `New question for ${backCompany.name}` : "New question"}
        description="Save it as a draft, or publish it straight away."
      />
      {previous ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>
            Saved {previous.externalId}
            {query.published ? " and published" : ""}
          </AlertTitle>
          <AlertDescription>
            <span>
              <Link href={`/admin/questions/${previous.id}`} className="text-primary underline">
                Open it
              </Link>
              . This form keeps its subject, topic, difficulty and companies.
            </span>
          </AlertDescription>
        </Alert>
      ) : null}
      <QuestionEditor
        // A new key per saved question resets the form for the next one.
        key={previous?.id ?? "blank"}
        taxonomy={taxonomy}
        initial={initial}
        companies={companies}
        initialCompanies={initialCompanies}
        addAnother={Boolean(company || previous)}
      />
    </>
  );
}
