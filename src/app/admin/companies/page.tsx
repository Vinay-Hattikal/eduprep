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
import { CATEGORY_LABELS, LEVEL_LABELS } from "@/lib/content/companies";
import { formatDate } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePermission } from "@/server/auth";
import { listCompanies } from "@/server/services/companies";
import { topCompanyRequests } from "@/server/services/reports";

export const metadata: Metadata = { title: "Companies" };

export default function CompaniesPage() {
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
        <CompanyList />
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

async function CompanyList() {
  await requirePermission("companies.manage");
  const companies = await listCompanies();

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
          key: "content",
          header: "Content",
          hideOnMobile: true,
          cell: (c) => (
            <span className="tabular text-sm text-muted-foreground">
              {c._count.rounds} rounds · {c._count.items} questions · {c._count.sources} sources
            </span>
          ),
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
