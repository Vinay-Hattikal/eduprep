import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  cancelImportAction,
  confirmImportAction,
  rollbackImportAction,
} from "@/app/admin/imports/actions";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { ImportStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ImportRowStatus } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { rollbackBlocker } from "@/server/imports/pipeline";
import { PUBLISHABLE_IMPORTS, publishesThroughJudge } from "@/server/imports/publish";
import { getImportDefinition } from "@/server/imports/registry";
import { REPLACE_CONFIRMATION, type RowMessage } from "@/server/imports/types";

export const metadata: Metadata = { title: "Import" };

const ROWS_PER_PAGE = 100;

const FILTERS = {
  all: { label: "All", statuses: undefined },
  problems: { label: "Errors", statuses: ["ERROR", "FAILED"] },
  warnings: { label: "Warnings", statuses: ["WARNING"] },
  ok: { label: "OK", statuses: ["VALID", "IMPORTED"] },
} as const satisfies Record<string, { label: string; statuses?: ImportRowStatus[] }>;
type Filter = keyof typeof FILTERS;

const ACTION_LABELS = { CREATE: "New", UPDATE: "Update", UNCHANGED: "No change" } as const;

export default function ImportBatchPage({
  params,
  searchParams,
}: PageProps<"/admin/imports/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/imports">
          <ArrowLeft /> All imports
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <BatchDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function rowKey(cells: Record<string, string>): string {
  return (
    cells.external_id || cells.slug || cells.topic_slug || cells.item_id || cells.company || ""
  );
}

async function BatchDetail({ params, searchParams }: PageProps<"/admin/imports/[id]">) {
  await requirePermission("imports.view");
  const { id } = await params;
  const query = await searchParams;
  const filter: Filter =
    typeof query.show === "string" && query.show in FILTERS ? (query.show as Filter) : "all";
  const page = Math.max(1, Number(query.page) || 1);
  const actionError = typeof query.error === "string" ? query.error : null;

  const batch = await db.importBatch.findUnique({
    where: { id },
    include: { uploadedBy: { select: { name: true } }, confirmedBy: { select: { name: true } } },
  });
  if (!batch) notFound();
  const definition = getImportDefinition(batch.type);

  const statuses = FILTERS[filter].statuses as ImportRowStatus[] | undefined;
  const where = { batchId: id, ...(statuses ? { status: { in: statuses } } : {}) };
  const [rows, rowCount] = await Promise.all([
    db.importRow.findMany({
      where,
      orderBy: { rowNumber: "asc" },
      skip: (page - 1) * ROWS_PER_PAGE,
      take: ROWS_PER_PAGE,
    }),
    db.importRow.count({ where }),
  ]);
  const working = ["QUEUED", "VALIDATING", "COMMITTING"].includes(batch.status);
  const importable = batch.validRows + batch.warningRows;
  const problems = batch.errorRows + batch.failedCount;
  const blocker = batch.status === "COMPLETED" ? await rollbackBlocker(id) : null;

  return (
    <div className="space-y-6">
      {working ? <AutoRefresh /> : null}
      <PageHeader
        title={batch.fileName}
        description={
          <>
            {definition.label}
            {batch.mode === "REPLACE" ? " · Replace all" : ""} · uploaded{" "}
            {formatDateTime(batch.createdAt)}
            {batch.uploadedBy ? ` by ${batch.uploadedBy.name}` : ""}
          </>
        }
        actions={
          <span data-testid="import-status">
            <ImportStatusBadge status={batch.status} />
          </span>
        }
      />

      {actionError ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>{actionError}</AlertDescription>
        </Alert>
      ) : null}

      {working ? (
        <Alert>
          <Loader2 className="animate-spin" />
          <AlertTitle>
            {batch.status === "COMMITTING" ? "Importing rows…" : "Checking the file…"}
          </AlertTitle>
          <AlertDescription>
            This page updates by itself. If it stays here for more than a minute, make sure the
            background worker is running (<code className="font-mono">npm run dev</code> starts it).
          </AlertDescription>
        </Alert>
      ) : null}

      {batch.error ? (
        <Alert variant="destructive">
          <XCircle />
          <AlertTitle>
            {batch.status === "FAILED" ? "The file couldn't be imported" : "Problem"}
          </AlertTitle>
          <AlertDescription>{batch.error}</AlertDescription>
        </Alert>
      ) : null}

      {batch.totalRows > 0 ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {batch.status === "COMPLETED" || batch.status === "ROLLED_BACK" ? (
            <>
              <StatCard label="New" value={batch.createdCount} />
              <StatCard label="Updated" value={batch.updatedCount} />
              <StatCard label="No change" value={batch.unchangedCount} />
              <StatCard label="Not imported" value={batch.errorRows + batch.failedCount} />
              {batch.mode === "REPLACE" ? (
                <StatCard label="Archived" value={batch.archivedCount} hint="Not in the file" />
              ) : null}
              {batch.publishAfterImport && !publishesThroughJudge(batch.type) ? (
                <StatCard
                  label="Published"
                  value={batch.publishedCount}
                  hint="Others failed a check and stayed drafts"
                />
              ) : null}
            </>
          ) : (
            <>
              <StatCard label="Rows" value={batch.totalRows} />
              <StatCard label="Ready" value={batch.validRows} />
              <StatCard label="With warnings" value={batch.warningRows} hint="Will be imported" />
              <StatCard label="With errors" value={batch.errorRows} hint="Will be skipped" />
            </>
          )}
        </div>
      ) : null}

      {batch.mode === "REPLACE" && batch.status === "PREVIEW_READY" ? (
        <Alert
          variant={batch.archiveCount ? "destructive" : "default"}
          data-testid="replace-preview"
        >
          <Archive />
          <AlertTitle>
            Replace all: {batch.archiveCount} item{batch.archiveCount === 1 ? "" : "s"} will be
            archived
          </AlertTitle>
          <AlertDescription>
            <p>
              These aren&apos;t in the file. Archived items are hidden from students; their history
              stays. A backup of everything is saved before anything changes.
            </p>
            {batch.archivePreview.length ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {batch.archivePreview.map((label) => (
                  <li key={label}>{label}</li>
                ))}
                {batch.archiveCount > batch.archivePreview.length ? (
                  <li>and {batch.archiveCount - batch.archivePreview.length} more</li>
                ) : null}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        {batch.status === "PREVIEW_READY" ? (
          <>
            <form action={confirmImportAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="batchId" value={batch.id} />
              {batch.mode === "REPLACE" ? (
                <div className="space-y-1.5">
                  <Label htmlFor="confirmation">Type {REPLACE_CONFIRMATION} to confirm</Label>
                  <Input
                    id="confirmation"
                    name="confirmation"
                    autoComplete="off"
                    className="w-40 font-mono"
                    data-testid="replace-confirmation"
                  />
                </div>
              ) : null}
              {PUBLISHABLE_IMPORTS.includes(batch.type) ? (
                <div className="flex items-center gap-2 self-center">
                  <Checkbox id="publish" name="publish" data-testid="publish-after-import" />
                  <Label htmlFor="publish" className="font-normal">
                    {publishesThroughJudge(batch.type)
                      ? "Publish each problem once it passes the judge check"
                      : "Publish after import"}
                  </Label>
                </div>
              ) : null}
              <Button type="submit" disabled={importable === 0} data-testid="confirm-import">
                <CheckCircle2 />{" "}
                {batch.mode === "REPLACE"
                  ? `Replace: import ${importable} row${importable === 1 ? "" : "s"}`
                  : `Import ${importable} row${importable === 1 ? "" : "s"}`}
              </Button>
            </form>
            <form action={cancelImportAction}>
              <input type="hidden" name="batchId" value={batch.id} />
              <Button type="submit" variant="outline">
                Cancel
              </Button>
            </form>
          </>
        ) : null}
        {batch.backupKey ? (
          <Button asChild variant="outline">
            <a href={`/admin/imports/${batch.id}/backup`} download data-testid="download-backup">
              <Download /> Download backup (before replace)
            </a>
          </Button>
        ) : null}
        {problems > 0 ? (
          <Button asChild variant="outline">
            <a href={`/admin/imports/${batch.id}/failed-rows`} download>
              <Download /> Download rows with errors
            </a>
          </Button>
        ) : null}
        {batch.status === "COMPLETED" && !blocker ? (
          <form action={rollbackImportAction}>
            <input type="hidden" name="batchId" value={batch.id} />
            <Button type="submit" variant="destructive">
              <RotateCcw /> Undo this import
            </Button>
          </form>
        ) : null}
      </div>
      {batch.status === "COMPLETED" && blocker ? (
        <p className="text-sm text-muted-foreground">Undo isn&apos;t available: {blocker}</p>
      ) : null}

      {batch.totalRows > 0 ? (
        <Card>
          <CardHeader className="gap-3">
            <CardTitle>Rows</CardTitle>
            <nav aria-label="Filter rows" className="flex flex-wrap gap-1">
              {(Object.keys(FILTERS) as Filter[]).map((key) => (
                <Button
                  key={key}
                  asChild
                  size="sm"
                  variant={key === filter ? "secondary" : "ghost"}
                >
                  <Link
                    href={
                      key === "all" ? `/admin/imports/${id}` : `/admin/imports/${id}?show=${key}`
                    }
                  >
                    {FILTERS[key].label}
                  </Link>
                </Button>
              ))}
            </nav>
          </CardHeader>
          <CardContent className="space-y-4">
            {rows.length === 0 ? (
              <EmptyState title="No rows in this view" />
            ) : (
              <ul className="divide-y rounded-lg border">
                {rows.map((row) => {
                  const messages = row.messages as RowMessage[];
                  const cells = row.data as Record<string, string>;
                  const isError = row.status === "ERROR" || row.status === "FAILED";
                  return (
                    <li
                      key={row.id}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-4"
                    >
                      <div className="flex shrink-0 items-center gap-2 sm:w-56">
                        <span className="tabular w-12 text-xs text-muted-foreground">
                          Row {row.rowNumber}
                        </span>
                        <span className="truncate font-mono text-sm">{rowKey(cells)}</span>
                      </div>
                      <div className="flex shrink-0 gap-1 sm:w-28">
                        {isError ? (
                          <Badge variant="destructive">
                            {row.status === "FAILED" ? "Failed" : "Error"}
                          </Badge>
                        ) : row.action ? (
                          <Badge variant={row.action === "UNCHANGED" ? "outline" : "secondary"}>
                            {ACTION_LABELS[row.action]}
                          </Badge>
                        ) : null}
                      </div>
                      <ul className="min-w-0 flex-1 space-y-1 text-sm">
                        {messages.length === 0 ? (
                          <li className="text-muted-foreground">OK</li>
                        ) : (
                          messages.map((message, index) => (
                            <li
                              key={index}
                              className={cn(
                                message.level === "error" ? "text-destructive" : "text-warning",
                              )}
                            >
                              {message.column ? (
                                <span className="font-mono text-xs">{message.column}: </span>
                              ) : null}
                              {message.message}
                            </li>
                          ))
                        )}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
            <Pagination
              page={page}
              pageCount={Math.max(1, Math.ceil(rowCount / ROWS_PER_PAGE))}
              params={{ show: filter === "all" ? undefined : filter }}
              basePath={`/admin/imports/${id}`}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
