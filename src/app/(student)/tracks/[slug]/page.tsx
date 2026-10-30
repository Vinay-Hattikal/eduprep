import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { MasteryBar } from "@/components/learning/mastery-bar";
import { Markdown } from "@/components/shared/markdown";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { DifficultyLabel } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupees } from "@/lib/commerce/pricing";
import { requirePermission } from "@/server/auth";
import { DESIGN_KIND_LABELS } from "@/lib/content/design";
import { getTrack } from "@/server/services/tracks";

export const metadata: Metadata = { title: "Career track" };

export default function TrackPage({ params }: PageProps<"/tracks/[slug]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/tracks">
          <ArrowLeft /> Career tracks
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Track params={params} />
      </Suspense>
    </div>
  );
}

async function Track({ params }: { params: PageProps<"/tracks/[slug]">["params"] }) {
  const user = await requirePermission("student.access");
  const { slug } = await params;
  const data = await getTrack(user, slug);
  if (!data) notFound();
  const { track, topics, problems, design, interviewTypes } = data;

  return (
    <div className="space-y-8">
      <PageHeader title={track.name} description={track.description} />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Roadmap</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown className="text-base">{track.roadmap}</Markdown>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Topics</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {topics.map((t) => (
              <div key={t.id} className="space-y-1.5">
                <MasteryBar label={t.name} score={t.mastery} attempts={t.attempts} />
                <div className="flex gap-3 text-xs">
                  {t._count.questions ? (
                    <Link
                      href={`/practice/session?topic=${t.slug}`}
                      className="text-primary hover:underline"
                    >
                      Practise {t._count.questions} questions
                    </Link>
                  ) : null}
                  {t._count.problems ? (
                    <Link href={`/coding?topic=${t.slug}`} className="text-primary hover:underline">
                      {t._count.problems} coding problems
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {problems.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Coding problems</h2>
            <ul className="divide-y rounded-xl border bg-card">
              {problems.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/coding/${p.slug}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.title}</span>
                    {p.solved ? (
                      <CheckCircle2 className="size-4 text-success" aria-label="Solved" />
                    ) : null}
                    <DifficultyLabel difficulty={p.difficulty} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {design.length ? (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Design questions</h2>
            <ul className="divide-y rounded-xl border bg-card">
              {design.map((d) => (
                <li key={d.slug}>
                  <Link
                    href={`/design/${d.slug}`}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-secondary/40"
                  >
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {DESIGN_KIND_LABELS[d.kind]}
                    </span>
                    <DifficultyLabel difficulty={d.difficulty} />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      {interviewTypes.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Practise with a real interviewer</h2>
          <div className="flex flex-wrap gap-3">
            {interviewTypes.map((t) => (
              <Button key={t.slug} asChild variant="outline">
                <Link href={`/interviews/book/${t.slug}`}>
                  {t.name} · {formatRupees(t.pricePaise)}
                </Link>
              </Button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
