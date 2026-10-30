import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, Building2, Plus } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CATEGORY_LABELS, LEVEL_LABELS } from "@/lib/content/companies";
import { DRAFT_STATUSES } from "@/lib/content/workflow";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/server/auth";
import { listCompanies } from "@/server/services/companies";
import { topCompanyRequests } from "@/server/services/reports";

export const metadata: Metadata = { title: "Companies" };

export default function CompaniesPage({ searchParams }: PageProps<"/admin/companies">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        description="Company profiles, hiring rounds, test sections and sources. Bulk changes go through Imports."
        actions={
          <Button asChild>
            <Link href="/admin/companies/new">
              <Plus /> New company
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <CompanyList searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <RequestedCompanies />
      </Suspense>
    </div>
  );
}

/** Companies students asked for (PRD 4.7): add the most-requested ones next. */
async function RequestedCompanies() {
  await requirePermission("companies.manage");
  const requests = await topCompanyRequests();
  if (requests.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Requested by students</CardTitle>
        <CardDescription>
          Companies students asked for that aren&apos;t listed yet. Add the top ones next.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y text-sm">
          {requests.map((request) => (
            <li key={request.name} className="flex items-center justify-between gap-3 py-2">
              <span>{request.name}</span>
              <Badge variant="secondary" className="tabular">
                {request.count} request{request.count === 1 ? "" : "s"}
              </Badge>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

const FILTERS = {
  all: "All companies",
  "not-ready": "Not ready",
  stale: "Not verified lately",
  draft: "Drafts",
  published: "Published",
} as const;
const SORTS = {
  name: "Name",
  progress: "Least ready first",
  verified: "Oldest check first",
} as const;

type Filter = keyof typeof FILTERS;
/** Archived companies sort after the rest: there's nothing left to do on them. */
const progress = (c: { status: string; readiness: { done: number; total: number } }) =>
  c.status === "ARCHIVED" ? 2 : c.readiness.done / c.readiness.total;
type Sort = keyof typeof SORTS;
const pick = <T extends string>(value: unknown, options: Record<T, string>, fallback: T): T =>
  typeof value === "string" && value in options ? (value as T) : fallback;

/** Companies with progress (D-067): filter to what needs work, sort by readiness or age. */
async function CompanyList({
  searchParams,
}: {
  searchParams: PageProps<"/admin/companies">["searchParams"];
}) {
  await requirePermission("companies.manage");
  const query = await searchParams;
  const filter = pick<Filter>(query.filter, FILTERS, "all");
  const sort = pick<Sort>(query.sort, SORTS, "name");
  const all = await listCompanies();
  const companies = all
    .filter((c) =>
      filter === "not-ready"
        ? c.status !== "ARCHIVED" && c.readiness.done < c.readiness.total
        : filter === "stale"
          ? c.stale
          : filter === "draft"
            ? DRAFT_STATUSES.includes(c.status)
            : filter === "published"
              ? c.status === "PUBLISHED"
              : true,
    )
    .sort((a, b) =>
      sort === "progress"
        ? progress(a) - progress(b)
        : sort === "verified"
          ? a.lastVerifiedAt.getTime() - b.lastVerifiedAt.getTime()
          : 0,
    );

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2" aria-label="Filter companies">
        <NativeSelect name="filter" defaultValue={filter} aria-label="Show" size="sm">
          {Object.entries(FILTERS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect name="sort" defaultValue={sort} aria-label="Sort" size="sm">
          {Object.entries(SORTS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" size="sm" variant="secondary">
          Apply
        </Button>
        <span className="text-sm text-muted-foreground">
          {companies.length} of {all.length}
        </span>
      </form>
      <CompanyTable companies={companies} />
    </div>
  );
}

function CompanyTable({ companies }: { companies: Awaited<ReturnType<typeof listCompanies>> }) {
  return (
    <DataTable
      caption="Companies"
      rows={companies}
      rowKey={(c) => c.id}
      emptyTitle="No companies yet"
      emptyDescription="Import companies.csv, or add one with New company."
      columns={[
        {
          key: "name",
          header: "Company",
          cell: (c) => (
            <div className="flex items-start gap-3">
              <Building2
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <Link
                  href={`/admin/companies/${c.slug}`}
                  className="font-medium text-primary hover:underline"
                >
                  {c.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {LEVEL_LABELS[c.level]} · {CATEGORY_LABELS[c.category]}
                </p>
              </div>
            </div>
          ),
        },
        { key: "status", header: "Status", cell: (c) => <ContentStatusBadge status={c.status} /> },
        {
          key: "progress",
          header: "Progress",
          cell: (c) => (
            <div className="min-w-32 space-y-1" data-testid="company-progress-cell">
              <span className="tabular text-sm font-medium">
                {c.readiness.done}/{c.readiness.total}
              </span>
              {c.readiness.next && c.status !== "ARCHIVED" ? (
                <p className="text-xs text-muted-foreground">Next: {c.readiness.next.label}</p>
              ) : null}
            </div>
          ),
        },
        {
          key: "content",
          header: "Content",
          hideOnMobile: true,
          cell: (c) => {
            const n = c.readiness.counts;
            const live = (x: { published: number; draft: number }) =>
              `${x.published}${x.draft ? ` (+${x.draft} draft)` : ""}`;
            return (
              <span className="tabular text-sm text-muted-foreground">
                {live(n.questions)} MCQs · {live(n.problems)} coding · {live(n.interviews)}{" "}
                interview · {n.mocks.published} mocks
              </span>
            );
          },
        },
        {
          key: "verified",
          header: "Last verified",
          hideOnMobile: true,
          className: "whitespace-nowrap",
          cell: (c) =>
            c.stale ? (
              <Badge variant="outline" className="border-warning/40 text-warning">
                <AlertTriangle /> {formatDate(c.lastVerifiedAt)}
              </Badge>
            ) : (
              <span className="text-muted-foreground">{formatDate(c.lastVerifiedAt)}</span>
            ),
        },
      ]}
    />
  );
}
