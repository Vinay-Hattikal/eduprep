import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Flag } from "lucide-react";
import { ResolveForm } from "@/app/admin/reports/resolve-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ReportStatus } from "@/generated/prisma/enums";
import { formatDateTime, plainExcerpt } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { listReports } from "@/server/services/reports";

export const metadata: Metadata = { title: "Error reports" };

const REASON_LABELS = {
  WRONG_ANSWER: "Wrong answer",
  WRONG_EXPLANATION: "Wrong explanation",
  TYPO: "Typo",
  UNCLEAR: "Unclear",
  OTHER: "Other",
} as const;

const FILTERS: Record<string, { label: string; status: ReportStatus | "ALL" }> = {
  open: { label: "Open", status: "OPEN" },
  fixed: { label: "Fixed", status: "FIXED" },
  rejected: { label: "No change", status: "REJECTED" },
  all: { label: "All", status: "ALL" },
};

export default function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Error reports"
        description="Problems students reported on questions. Fix the question first, then close the report with a reply."
      />
      <Suspense fallback={<TableSkeleton />}>
        <Reports searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Reports({
  searchParams,
}: {
  searchParams: PageProps<"/admin/reports">["searchParams"];
}) {
  await requirePermission("content.edit");
  const query = await searchParams;
  const key = typeof query.show === "string" && query.show in FILTERS ? query.show : "open";
  const reports = await listReports(FILTERS[key]!.status);

  return (
    <div className="space-y-4">
      <nav aria-label="Filter reports" className="flex flex-wrap gap-1">
        {Object.entries(FILTERS).map(([value, filter]) => (
          <Button key={value} asChild size="sm" variant={value === key ? "secondary" : "ghost"}>
            <Link href={value === "open" ? "/admin/reports" : `/admin/reports?show=${value}`}>
              {filter.label}
            </Link>
          </Button>
        ))}
      </nav>

      {reports.length === 0 ? (
        <EmptyState
          icon={Flag}
          title={key === "open" ? "No open reports" : "Nothing here"}
          description="Reports from students appear here."
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <li key={report.id}>
              <Card>
                <CardContent className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{REASON_LABELS[report.reason]}</Badge>
                      <Link
                        href={`/admin/questions/${report.question.id}`}
                        className="font-mono text-xs font-medium text-primary hover:underline"
                      >
                        {report.question.externalId}
                      </Link>
                      <ContentStatusBadge status={report.question.status} />
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(report.createdAt)}
                        {report.user ? ` · ${report.user.name}` : ""}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {plainExcerpt(report.question.text, 140)}
                    </p>
                    <blockquote className="border-l-2 border-primary/40 pl-3 text-sm whitespace-pre-line">
                      {report.message}
                    </blockquote>
                  </div>
                  <div>
                    {report.status === "OPEN" ? (
                      <ResolveForm id={report.id} />
                    ) : (
                      <div className="space-y-1 text-sm">
                        <Badge variant={report.status === "FIXED" ? "secondary" : "outline"}>
                          {report.status === "FIXED" ? "Fixed" : "No change needed"}
                        </Badge>
                        <p>{report.reply}</p>
                        <p className="text-xs text-muted-foreground">
                          {report.resolvedBy?.name}
                          {report.resolvedAt ? ` · ${formatDateTime(report.resolvedAt)}` : ""}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
