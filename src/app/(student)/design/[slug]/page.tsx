import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { Markdown } from "@/components/shared/markdown";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge, DifficultyLabel } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/server/auth";
import { DESIGN_KIND_LABELS } from "@/lib/content/design";
import { getDesignQuestion } from "@/server/services/tracks";

export const metadata: Metadata = { title: "Design question" };

export default function DesignQuestionPage({ params }: PageProps<"/design/[slug]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/design">
          <ArrowLeft /> Design question bank
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Question params={params} />
      </Suspense>
    </div>
  );
}

async function Question({ params }: { params: PageProps<"/design/[slug]">["params"] }) {
  const user = await requirePermission("student.access");
  const { slug } = await params;
  const q = await getDesignQuestion(user, slug);
  if (!q) notFound();

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{q.title}</h1>
          {q.status !== "PUBLISHED" ? <ContentStatusBadge status={q.status} /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="secondary">{DESIGN_KIND_LABELS[q.kind]}</Badge>
          <DifficultyLabel difficulty={q.difficulty} />
          {q.companyRefs.map((c) => (
            <Badge key={c.slug} variant="outline">
              Asked at {c.name}
            </Badge>
          ))}
        </div>
      </header>
      <Card>
        <CardContent className="space-y-6 pt-6">
          <Markdown>{q.prompt}</Markdown>
          <section className="space-y-2">
            <h2 className="font-semibold">Requirements</h2>
            <Markdown className="text-base">{q.requirements}</Markdown>
          </section>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Take 30-40 minutes: clarify requirements, sketch the components, then go deep on one part.
        Then compare below.
      </p>
      <details className="group rounded-xl border bg-card" data-testid="design-approach">
        <summary className="cursor-pointer px-6 py-4 font-semibold">Show the approach</summary>
        <div className="space-y-2 border-t px-6 py-4">
          <Markdown className="text-base">{q.approach}</Markdown>
        </div>
      </details>
      <details className="rounded-xl border bg-card">
        <summary className="cursor-pointer px-6 py-4 font-semibold">Trade-offs to discuss</summary>
        <div className="border-t px-6 py-4">
          <Markdown className="text-base">{q.tradeoffs}</Markdown>
        </div>
      </details>
      {q.followUps ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Follow-up questions</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Markdown className="text-base">{q.followUps}</Markdown>
          </CardContent>
        </Card>
      ) : null}
      <Button asChild variant="outline">
        <Link href="/interviews/book/system-design">Practise this with an interviewer</Link>
      </Button>
    </article>
  );
}
