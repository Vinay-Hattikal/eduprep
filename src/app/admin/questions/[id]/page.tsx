import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { taxonomyOptions, toEditorValues } from "@/app/admin/questions/editor-data";
import { QuestionEditor } from "@/app/admin/questions/question-editor";
import { WorkflowActions } from "@/app/admin/questions/[id]/workflow-actions";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { checkQuestion } from "@/lib/content/question-rules";
import { ACTION_LABELS, availableActions, type ContentAction } from "@/lib/content/workflow";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { companyOptions } from "@/server/services/company-links";
import { getQuestion, getQuestionHistory } from "@/server/services/questions";

export const metadata: Metadata = { title: "Question" };

const FIELD_NAMES: Record<string, string> = {
  subjectId: "subject",
  topicId: "topic",
  subtopicId: "subtopic",
  codeLanguage: "code language",
  correctOptions: "correct answer",
  numericAnswer: "answer",
  expectedTimeSec: "time",
  passageId: "passage",
};

export default function QuestionPage({ params, searchParams }: PageProps<"/admin/questions/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/questions">
          <ArrowLeft /> Questions
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <QuestionDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function QuestionDetail({ params, searchParams }: PageProps<"/admin/questions/[id]">) {
  const user = await requirePermission("content.view");
  const { id } = await params;
  const query = await searchParams;
  const question = await getQuestion(id);
  if (!question) notFound();

  const [taxonomy, history, companies] = await Promise.all([
    taxonomyOptions(),
    getQuestionHistory(id),
    companyOptions(),
  ]);
  const actions = availableActions(question.status, user);
  const issues = checkQuestion(question);
  const canEdit = can(user.roles, "content.edit") && question.status !== "ARCHIVED";
  const done = typeof query.done === "string" ? (query.done as ContentAction) : null;
  const error = typeof query.error === "string" ? query.error : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={question.externalId}
        description={`${question.subject.name} › ${question.topic.name}${question.subtopic ? ` › ${question.subtopic.name}` : ""} · version ${question.version}`}
        actions={<ContentStatusBadge status={question.status} />}
      />

      {query.saved ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{query.published ? "Saved and published" : "Saved"}</AlertTitle>
          {query.draft ? (
            <AlertDescription>
              The question went back to draft and is hidden from students. Publish it again when
              it&apos;s ready.
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}
      {done && done in ACTION_LABELS ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Done: {ACTION_LABELS[done]}</AlertTitle>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">Automatic checks: </span>
              {issues.some((i) => i.level === "error") ? (
                <span className="font-medium text-destructive">fails, fix before publishing</span>
              ) : issues.length ? (
                <span className="font-medium text-warning">passes with warnings</span>
              ) : (
                <span className="font-medium text-success">passes</span>
              )}
            </p>
            {issues.length ? (
              <ul className="list-disc pl-5 text-muted-foreground">
                {issues.map((issue) => (
                  <li key={issue.message}>{issue.message}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-muted-foreground">
              {question.author ? `Written by ${question.author.name}` : "Imported"}
              {question.reviewer && question.status === "PUBLISHED"
                ? ` · published by ${question.reviewer.name}`
                : ""}
              {question.companies.length
                ? ` · used by ${question.companies.map((c) => c.company.name).join(", ")}`
                : ""}
            </p>
          </div>
          <WorkflowActions id={question.id} actions={actions} />
        </CardContent>
      </Card>

      <QuestionEditor
        taxonomy={taxonomy}
        initial={toEditorValues(question)}
        passage={question.passage}
        readOnly={!canEdit}
        companies={companies}
        initialCompanies={question.companies.map((c) => ({
          companyId: c.companyId,
          askedIn: c.askedIn.join(", "),
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <Badge variant="outline" className="tabular">
                  v{entry.version}
                </Badge>
                <span className="inline-block font-medium first-letter:uppercase">
                  {entry.reason}
                </span>
                <span className="text-muted-foreground">
                  {formatDateTime(entry.createdAt)}
                  {entry.createdBy ? ` · ${entry.createdBy}` : ""}
                </span>
                {entry.changes.length ? (
                  <span className="w-full text-xs text-muted-foreground sm:w-auto">
                    Changed: {entry.changes.map((field) => FIELD_NAMES[field] ?? field).join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
