import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { UploadForm } from "@/app/admin/imports/upload-form";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton, TableSkeleton } from "@/components/shared/skeletons";
import { ImportStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { IMPORT_DEFINITIONS } from "@/server/imports/registry";

export const metadata: Metadata = { title: "Imports" };

const TYPE_LABELS = Object.fromEntries(IMPORT_DEFINITIONS.map((d) => [d.type, d.label]));

export default function ImportsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Imports"
        description="Upload CSV files for content. Every file is checked first, and nothing goes live without review."
      />
      <Suspense fallback={<PageSkeleton />}>
        <UploadCard />
      </Suspense>
      <Suspense fallback={null}>
        <ExportCard />
      </Suspense>
      <section className="space-y-3" aria-labelledby="history-heading">
        <h2 id="history-heading" className="text-lg font-semibold tracking-tight">
          Recent imports
        </h2>
        <Suspense fallback={<TableSkeleton />}>
          <ImportHistory />
        </Suspense>
      </section>
    </div>
  );
}

async function UploadCard() {
  const user = await requirePermission("imports.view");
  const types = IMPORT_DEFINITIONS.filter((d) => can(user.roles, d.permission)).map((d) => ({
    type: d.type,
    label: d.label,
    description: d.description,
    template: d.template,
    allowZip: d.allowZip,
    legacy: Boolean(d.legacy),
    replace: Boolean(d.replace),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload a file</CardTitle>
        <CardDescription>
          Import in the numbered order: taxonomy, companies, then questions and coding problems.
          Re-upload a whole file whenever you edit it: only new and changed rows are saved, and
          exact duplicates are refused.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <UploadForm types={types} canReplace={user.roles.includes("ADMIN")} />
      </CardContent>
    </Card>
  );
}

/** Download what's saved now, edit it, upload it back (D-054). */
async function ExportCard() {
  const user = await requirePermission("imports.view");
  const content = can(user.roles, "content.edit");
  const companies = can(user.roles, "companies.manage");
  if (!content && !companies) return null;
  const subjects = content
    ? await db.subject.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } })
    : [];
  const link = (href: string, label: string) => (
    <Button key={href} asChild variant="outline" size="sm">
      <a href={href} download>
        <Download /> {label}
      </a>
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Download current data</CardTitle>
        <CardDescription>
          Get the saved content in the upload format, with IDs filled in. Edit it and upload it
          back: no need to keep your own copies.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {companies ? link("/admin/imports/export/companies", "Companies") : null}
          {companies ? link("/admin/imports/export/company-process", "Rounds and sections") : null}
          {content ? link("/admin/imports/export/coding", "Coding problems") : null}
        </div>
        {subjects.length ? (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">MCQs by subject</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {subjects.map((s) => link(`/admin/imports/export/mcq?subject=${s.slug}`, s.name))}
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  );
}

async function ImportHistory() {
  await requirePermission("imports.view");
  const batches = await db.importBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { uploadedBy: { select: { name: true } } },
  });

  return (
    <DataTable
      caption="Recent imports"
      rows={batches}
      rowKey={(b) => b.id}
      emptyTitle="No imports yet"
      emptyDescription="Upload a file above. Start with the taxonomy."
      columns={[
        {
          key: "file",
          header: "File",
          cell: (b) => (
            <div className="min-w-0">
              <Link
                href={`/admin/imports/${b.id}`}
                className="font-medium text-primary hover:underline"
              >
                {b.fileName}
              </Link>
              <p className="text-xs text-muted-foreground">{TYPE_LABELS[b.type]}</p>
            </div>
          ),
        },
        { key: "status", header: "Status", cell: (b) => <ImportStatusBadge status={b.status} /> },
        {
          key: "rows",
          header: "Rows",
          hideOnMobile: true,
          cell: (b) =>
            b.status === "COMPLETED" ? (
              <span className="tabular text-sm">
                {b.createdCount} new · {b.updatedCount} updated · {b.unchangedCount} same
                {b.failedCount ? ` · ${b.failedCount} failed` : ""}
              </span>
            ) : b.totalRows ? (
              <span className="tabular text-sm">
                {b.totalRows} rows{b.errorRows ? ` · ${b.errorRows} with errors` : ""}
              </span>
            ) : (
              "—"
            ),
        },
        {
          key: "when",
          header: "Uploaded",
          hideOnMobile: true,
          className: "whitespace-nowrap text-muted-foreground",
          cell: (b) => (
            <span>
              {formatDateTime(b.createdAt)}
              {b.uploadedBy ? <span className="block text-xs">{b.uploadedBy.name}</span> : null}
            </span>
          ),
        },
      ]}
    />
  );
}
