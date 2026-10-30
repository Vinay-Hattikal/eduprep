import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PencilRuler } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { DifficultyLabel } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/auth";
import { DESIGN_KIND_LABELS, DESIGN_KINDS } from "@/lib/content/design";
import { listDesignQuestions } from "@/server/services/tracks";

export const metadata: Metadata = { title: "Design question bank" };

export default function DesignPage({ searchParams }: PageProps<"/design">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Design question bank"
        description="System design and low-level design: try the question yourself first, then compare with the approach and trade-offs."
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Questions searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Questions({ searchParams }: { searchParams: PageProps<"/design">["searchParams"] }) {
  const user = await requirePermission("student.access");
  const { kind } = await searchParams;
  const filterKind = DESIGN_KINDS.find((k) => k === kind);
  const questions = await listDesignQuestions(user, { kind: filterKind });

  return (
    <div className="space-y-4">
      <nav aria-label="Kind" className="flex flex-wrap gap-1">
        {[undefined, ...DESIGN_KINDS].map((k) => (
          <Button
            key={k ?? "all"}
            asChild
            size="sm"
            variant={filterKind === k ? "secondary" : "ghost"}
          >
            <Link href={k ? `/design?kind=${k}` : "/design"}>
              {k ? DESIGN_KIND_LABELS[k] : "All"}
            </Link>
          </Button>
        ))}
      </nav>
      {questions.length === 0 ? (
        <EmptyState icon={PencilRuler} title="No design questions yet" />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {questions.map((q) => (
            <li key={q.slug}>
              <Link
                href={`/design/${q.slug}`}
                className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-secondary/40"
              >
                <span className="min-w-0 flex-1 font-medium">{q.title}</span>
                <span className="text-xs text-muted-foreground">{DESIGN_KIND_LABELS[q.kind]}</span>
                <DifficultyLabel difficulty={q.difficulty} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
