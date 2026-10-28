import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Lock, PlayCircle } from "lucide-react";
import { StartTestForm } from "@/app/(student)/tests/[slug]/start-form";
import { Markdown } from "@/components/shared/markdown";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/server/auth";
import { getTestCard, KIND_LABELS } from "@/server/services/tests";

export const metadata: Metadata = { title: "Mock test" };

export default function TestPage({ params }: PageProps<"/tests/[slug]">) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/tests">
          <ArrowLeft /> Mock tests
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Instructions params={params} />
      </Suspense>
    </div>
  );
}

async function Instructions({ params }: { params: PageProps<"/tests/[slug]">["params"] }) {
  const user = await requirePermission("student.access");
  const { slug } = await params;
  const test = await getTestCard(user, slug);
  if (!test) notFound();
  const sequential = test.navigation === "SEQUENTIAL";

  return (
    <div className="space-y-6">
      <PageHeader
        title={test.title}
        description={`${KIND_LABELS[test.kind]}${test.company ? ` · ${test.company.name}` : ""} · ${test.minutes} minutes · ${test.items} questions`}
      />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Sections</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="divide-y">
            {test.sections.map((s, i) => (
              <li
                key={i}
                className="flex items-center justify-between gap-3 py-2.5 text-sm first:pt-0 last:pb-0"
              >
                <span className="min-w-0 truncate font-medium">
                  {i + 1}. {s.name}
                  <span className="ml-2 font-normal text-muted-foreground">
                    {s.type === "CODING" ? "Coding" : "MCQ"}
                  </span>
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {s.items} Q · {s.minutes} min
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Before you begin</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            {sequential ? (
              <li>
                Sections run one after another, each with its own timer. When a section&apos;s time
                ends the next one starts, and you can&apos;t go back to it.
              </li>
            ) : (
              <li>One timer for the whole test. You can move between sections freely.</li>
            )}
            <li>
              Wrong answers may carry negative marks. Leaving a question blank never costs marks.
            </li>
            <li>
              Answers save automatically. If you lose connection, reopen the test to continue.
            </li>
            <li>
              Mark questions for review to come back to them. Marked questions with an answer still
              count.
            </li>
            <li>
              The test submits itself when time runs out. Switching tabs is recorded, as in real
              proctored tests.
            </li>
            <li>Use a laptop for coding sections if you can.</li>
          </ul>
          {test.instructions ? <Markdown className="text-sm">{test.instructions}</Markdown> : null}

          {test.inProgressId ? (
            <Button asChild size="lg">
              <Link href={`/exam/${test.inProgressId}`}>
                <PlayCircle /> Resume test
              </Link>
            </Button>
          ) : test.locked ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Lock className="size-4" aria-hidden="true" /> You&apos;ve used the free mock for this
              company. Paid plans with unlimited mocks are coming soon.
            </p>
          ) : (
            <StartTestForm slug={test.slug} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
