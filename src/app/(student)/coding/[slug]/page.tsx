import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { CodingWorkspace } from "@/components/coding/coding-workspace";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge, DifficultyLabel } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/auth";
import { getWorkspaceProblem, listSubmissions } from "@/server/services/coding";

export const metadata: Metadata = { title: "Coding" };

export default function ProblemPage({ params }: PageProps<"/coding/[slug]">) {
  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/coding">
          <ArrowLeft /> All problems
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Workspace params={params} />
      </Suspense>
    </div>
  );
}

async function Workspace({ params }: { params: PageProps<"/coding/[slug]">["params"] }) {
  const user = await requirePermission("student.access");
  const { slug } = await params;
  const problem = await getWorkspaceProblem(user, slug);
  if (!problem) notFound();
  const history = await listSubmissions(user.id, problem.id);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{problem.title}</h1>
          {problem.status !== "PUBLISHED" ? (
            <ContentStatusBadge status={problem.status as "DRAFT"} />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <DifficultyLabel difficulty={problem.difficulty} />
          {problem.topics.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
          {problem.companies.map((c) => (
            <Badge key={c.slug} variant="outline">
              {c.name}
            </Badge>
          ))}
          <span className="text-xs text-muted-foreground">Memory {problem.memoryLimitMb} MB</span>
        </div>
      </div>
      <CodingWorkspace
        problem={problem}
        history={history.map((s) => ({
          id: s.id,
          language: s.language,
          verdict: s.verdict,
          testsPassed: s.testsPassed,
          testsTotal: s.testsTotal,
          runtimeMs: s.runtimeMs,
          createdAt: s.createdAt,
          code: s.code,
        }))}
      />
    </div>
  );
}
