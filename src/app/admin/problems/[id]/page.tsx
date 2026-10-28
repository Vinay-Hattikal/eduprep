import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, ExternalLink, Loader2, Trash2 } from "lucide-react";
import {
  deleteSolutionAction,
  deleteTestCaseAction,
  validateProblemAction,
} from "@/app/admin/problems/actions";
import {
  AddTestForm,
  ProblemForm,
  ProblemWorkflow,
  SolutionForm,
} from "@/app/admin/problems/[id]/forms";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { availableActions, ACTION_LABELS, type ContentAction } from "@/lib/content/workflow";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { getAdminProblem, listDsaTopics } from "@/server/services/problems";

export const metadata: Metadata = { title: "Coding problem" };

export default function ProblemPage({ params, searchParams }: PageProps<"/admin/problems/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/problems">
          <ArrowLeft /> Coding problems
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const preview = (text: string) => (text.length > 120 ? `${text.slice(0, 120)}…` : text);

async function Detail({ params, searchParams }: PageProps<"/admin/problems/[id]">) {
  const user = await requirePermission("content.view");
  const { id } = await params;
  const query = await searchParams;
  const [problem, topics] = await Promise.all([getAdminProblem(id), listDsaTopics()]);
  if (!problem) notFound();

  const canEdit = can(user.roles, "content.edit") && problem.status !== "ARCHIVED";
  const actions = availableActions(problem.status, user);
  const done = typeof query.done === "string" ? (query.done as ContentAction) : null;
  const error = typeof query.error === "string" ? query.error : null;
  const samples = problem.testCases.filter((t) => t.isSample).length;

  return (
    <div className="space-y-6">
      {problem.validating ? <AutoRefresh intervalMs={2000} /> : null}
      <PageHeader
        title={problem.title}
        description={`${problem.externalId} · ${problem.topics.map((t) => t.name).join(", ")} · version ${problem.version}`}
        actions={
          <>
            <ContentStatusBadge status={problem.status} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/coding/${problem.slug}`}>
                <ExternalLink /> Open as student
              </Link>
            </Button>
          </>
        }
      />

      {query.created ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Problem created as a draft</AlertTitle>
          <AlertDescription>
            Add at least 1 sample and 5 hidden tests and a reference solution, then check it in the
            judge.
          </AlertDescription>
        </Alert>
      ) : null}
      {query.solution ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{query.solution === "deleted" ? "Code deleted" : "Code saved"}</AlertTitle>
        </Alert>
      ) : null}
      {query.saved ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Saved</AlertTitle>
          {query.draft ? (
            <AlertDescription>
              The problem went back to draft and is hidden from students. Publish it again when
              it&apos;s ready.
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}
      {done ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{ACTION_LABELS[done]}: done</AlertTitle>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {query.publishing && problem.status !== "PUBLISHED" ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Publishing after the judge check</AlertTitle>
          <AlertDescription>
            The problem is published as soon as every solution passes every test. If the check
            fails, it stays a draft and the report below says why.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card data-testid="judge-check">
        <CardHeader>
          <CardTitle>
            <h2>Judge check</h2>
          </CardTitle>
          <CardDescription>
            Every reference and brute-force solution runs against every test. Problems are published
            only after this passes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {problem.validating ? (
            <p className="flex items-center gap-2 text-sm text-info" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Running solutions in
              the judge…
            </p>
          ) : problem.validatedAt ? (
            <p className="flex items-center gap-2 text-sm font-medium text-success">
              <CheckCircle2 className="size-4" aria-hidden="true" /> Passed{" "}
              {formatDateTime(problem.validatedAt)}
            </p>
          ) : problem.validationNote ? (
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <CircleAlert className="size-4" aria-hidden="true" /> Failed
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not checked since the last change.</p>
          )}
          {problem.validationNote ? (
            <pre className="overflow-x-auto rounded-lg border bg-surface p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {problem.validationNote}
            </pre>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <form action={validateProblemAction}>
                <input type="hidden" name="id" value={problem.id} />
                <Button
                  type="submit"
                  variant="outline"
                  disabled={problem.validating}
                  data-testid="validate-problem"
                >
                  Check in judge
                </Button>
              </form>
            ) : null}
            <ProblemWorkflow
              id={problem.id}
              actions={actions}
              validated={Boolean(problem.validatedAt)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {problem.stats.submissions} student submissions · {problem.stats.accepted} accepted
            {problem.companies.length
              ? ` · asked at ${problem.companies.map((c) => c.company.name).join(", ")}`
              : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>
              Tests{" "}
              <span className="font-normal text-muted-foreground">
                ({samples} sample, {problem.testCases.length - samples} hidden)
              </span>
            </h2>
          </CardTitle>
          <CardDescription>
            For big test sets, import a ZIP problem package instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ol className="divide-y rounded-lg border">
            {problem.testCases.map((t) => (
              <li key={t.id} className="flex items-start gap-3 p-3 text-sm">
                <span className="w-8 shrink-0 font-mono text-muted-foreground">#{t.order}</span>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                  <pre className="truncate font-mono text-xs" title="Input">
                    {preview(t.input) || "(empty)"}
                  </pre>
                  <pre className="truncate font-mono text-xs" title="Expected output">
                    {preview(t.output)}
                  </pre>
                </div>
                {t.isSample ? (
                  <Badge variant="secondary">Sample</Badge>
                ) : (
                  <Badge variant="outline">Hidden</Badge>
                )}
                {canEdit ? (
                  <form action={deleteTestCaseAction}>
                    <input type="hidden" name="problemId" value={problem.id} />
                    <input type="hidden" name="testId" value={t.id} />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete test ${t.order}`}
                    >
                      <Trash2 />
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ol>
          {canEdit ? <AddTestForm problemId={problem.id} /> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Solutions</h2>
          </CardTitle>
          <CardDescription>
            Reference and brute-force code decide what the judge accepts; changing them re-runs the
            judge check. Starter code is what students see first in the editor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {problem.solutions.length ? (
            <ul className="space-y-2">
              {problem.solutions.map((s) => (
                <li key={s.id}>
                  <details className="rounded-lg border">
                    <summary className="flex cursor-pointer items-center gap-2 p-3 text-sm">
                      <Badge variant={s.kind === "REFERENCE" ? "default" : "secondary"}>
                        {s.kind.toLowerCase()}
                      </Badge>
                      <span className="font-mono">{s.language}</span>
                    </summary>
                    <div className="space-y-3 border-t p-3">
                      {canEdit ? (
                        <>
                          <SolutionForm
                            problemId={problem.id}
                            languages={problem.languages}
                            initial={{ kind: s.kind, language: s.language, code: s.code }}
                          />
                          <form action={deleteSolutionAction}>
                            <input type="hidden" name="problemId" value={problem.id} />
                            <input type="hidden" name="solutionId" value={s.id} />
                            <Button type="submit" variant="ghost" size="sm">
                              <Trash2 /> Delete this code
                            </Button>
                          </form>
                        </>
                      ) : (
                        <pre className="max-h-96 overflow-auto bg-surface p-3 font-mono text-xs">
                          {s.code}
                        </pre>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              No solutions yet. Add a reference solution before checking in the judge.
            </p>
          )}
          {canEdit ? (
            <div className="space-y-3 rounded-lg border border-dashed p-4">
              <h3 className="text-sm font-semibold">Add code</h3>
              <SolutionForm problemId={problem.id} languages={problem.languages} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Edit problem</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProblemForm
              topics={topics}
              values={{
                id: problem.id,
                externalId: problem.externalId,
                slug: problem.slug,
                title: problem.title,
                difficulty: problem.difficulty,
                topicIds: problem.topics.map((t) => t.id),
                languages: problem.languages,
                statement: problem.statement,
                inputFormat: problem.inputFormat,
                outputFormat: problem.outputFormat,
                constraints: problem.constraints,
                timeLimitMs: problem.timeLimitMs,
                memoryLimitMb: problem.memoryLimitMb,
                scoring: problem.scoring,
                checker: problem.checker,
                source: problem.source,
                hints: problem.hints,
                editorial: problem.editorial,
              }}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
