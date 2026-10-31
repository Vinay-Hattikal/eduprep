import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Flag } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FLAG_LABELS, MIN_ATTEMPTS_FOR_FLAGS } from "@/lib/content/analytics";
import { plainExcerpt } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { getQuestionAnalytics } from "@/server/services/ops";

export const metadata: Metadata = { title: "Content analytics" };

export default function AnalyticsPage({ searchParams }: PageProps<"/admin/analytics">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Content analytics"
        description={`How students answer each question, from practice and tests. Flags appear after ${MIN_ATTEMPTS_FOR_FLAGS} answers.`}
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Analytics searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Analytics({
  searchParams,
}: {
  searchParams: PageProps<"/admin/analytics">["searchParams"];
}) {
  await requirePermission("content.view");
  const flaggedOnly = (await searchParams).show !== "all";
  const { rows, flagged, measured } = await getQuestionAnalytics({ flaggedOnly });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard label="Questions with enough answers" value={measured} />
        <StatCard label="Flagged for review" value={flagged} icon={Flag} />
      </div>
      <nav aria-label="Show" className="flex gap-1">
        <Button asChild size="sm" variant={flaggedOnly ? "secondary" : "ghost"}>
          <Link href="/admin/analytics">Flagged</Link>
        </Button>
        <Button asChild size="sm" variant={flaggedOnly ? "ghost" : "secondary"}>
          <Link href="/admin/analytics?show=all">All answered questions</Link>
        </Button>
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          icon={Flag}
          title={flaggedOnly ? "Nothing flagged" : "Not enough answers yet"}
          description={
            flaggedOnly
              ? "No question looks suspicious right now."
              : "Statistics appear once questions have been answered a few times."
          }
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((q) => (
            <li key={q.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/admin/questions/${q.id}`}
                  className="font-mono text-sm font-medium text-primary hover:underline"
                >
                  {q.externalId}
                </Link>
                <span className="text-xs text-muted-foreground">{q.topic}</span>
                {q.flags.map((f) => (
                  <Badge
                    key={f}
                    variant="outline"
                    className="border-warning/30 bg-warning/10 text-warning"
                  >
                    {FLAG_LABELS[f]}
                  </Badge>
                ))}
              </div>
              <p className="line-clamp-2 text-sm">{plainExcerpt(q.text, 220)}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                <span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {Math.round(q.accuracy * 100)}%
                  </span>{" "}
                  right
                </span>
                <span>{q.attempts} answers</span>
                <span>
                  median {q.medianTimeSec}s (expected {q.expectedTimeSec}s)
                </span>
              </div>
              {q.optionShares.length ? (
                <div
                  className="space-y-1.5"
                  role="list"
                  aria-label="How often each option was chosen"
                >
                  {q.optionShares.map((o) => (
                    <div key={o.letter} role="listitem" className="flex items-center gap-2 text-xs">
                      <span className="w-4 font-semibold">{o.letter}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            "h-full rounded-full",
                            o.correct ? "bg-success" : "bg-muted-foreground/50",
                          )}
                          style={{ width: `${o.share * 100}%` }}
                        />
                      </div>
                      <span className="w-20 text-right tabular-nums">
                        {Math.round(o.share * 100)}%{o.correct ? " ✓ key" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
