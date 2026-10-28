import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, FileUp, Plus, Search } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { listPassages, PASSAGE_PAGE_SIZE } from "@/server/services/passages";

export const metadata: Metadata = { title: "Passages" };

export default function PassagesPage({ searchParams }: PageProps<"/admin/passages">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Passages"
        description="Reading passages and data tables that several questions share. Questions link to a passage by its ID."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/imports">
                <FileUp /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/passages/new">
                <Plus /> New passage
              </Link>
            </Button>
          </>
        }
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Passages searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Passages({
  searchParams,
}: {
  searchParams: PageProps<"/admin/passages">["searchParams"];
}) {
  await requirePermission("content.view");
  const query = await searchParams;
  const q = typeof query.q === "string" ? query.q.trim().slice(0, 100) || undefined : undefined;
  const page = Math.max(1, Number(query.page) || 1);
  const { rows, total } = await listPassages({ q, page });

  return (
    <div className="space-y-4">
      {query.deleted ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Passage deleted</AlertTitle>
        </Alert>
      ) : null}
      <form className="flex flex-wrap items-end gap-2" role="search" aria-label="Search passages">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search title or ID"
            aria-label="Search"
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <p className="tabular text-sm text-muted-foreground">
        {total} passage{total === 1 ? "" : "s"}
      </p>
      <DataTable
        caption="Passages"
        rows={rows}
        rowKey={(p) => p.id}
        emptyTitle={q ? "No passages match" : "No passages yet"}
        emptyDescription="Create one with New passage, or import passages.csv."
        columns={[
          {
            key: "title",
            header: "Passage",
            cell: (p) => (
              <div>
                <Link
                  href={`/admin/passages/${p.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {p.title}
                </Link>
                <p className="font-mono text-xs text-muted-foreground">{p.externalId}</p>
              </div>
            ),
          },
          {
            key: "questions",
            header: "Questions",
            cell: (p) => <span className="tabular-nums">{p._count.questions}</span>,
          },
          {
            key: "updated",
            header: "Updated",
            hideOnMobile: true,
            cell: (p) => formatDate(p.updatedAt),
          },
        ]}
      />
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PASSAGE_PAGE_SIZE))}
        basePath="/admin/passages"
        params={{ q }}
      />
    </div>
  );
}
