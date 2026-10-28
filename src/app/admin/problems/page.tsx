import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CheckCircle2, CircleAlert, CircleDashed, FileUp, Plus, Search } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge, DifficultyLabel } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Difficulty } from "@/generated/prisma/enums";
import { STATUS_CHOICES, STATUS_LABELS } from "@/lib/content/workflow";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { listAdminProblems, PROBLEM_PAGE_SIZE } from "@/server/services/problems";

export const metadata: Metadata = { title: "Coding problems" };

const STATUSES = STATUS_CHOICES;

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export default function ProblemsPage({ searchParams }: PageProps<"/admin/problems">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Coding problems"
        description="Import problems in bulk or write them one at a time. Every problem is checked in the judge before it can be published."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/imports">
                <FileUp /> Import problems
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/problems/new">
                <Plus /> New problem
              </Link>
            </Button>
          </>
        }
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <ProblemTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Validation({ validatedAt, note }: { validatedAt: Date | null; note: string | null }) {
  if (validatedAt) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-success">
        <CheckCircle2 className="size-4" aria-hidden="true" /> Passed
      </span>
    );
  }
  if (note) {
    return (
      <span className="inline-flex items-center gap-1 text-sm text-destructive">
        <CircleAlert className="size-4" aria-hidden="true" /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <CircleDashed className="size-4" aria-hidden="true" /> Not checked
    </span>
  );
}

async function ProblemTable({
  searchParams,
}: {
  searchParams: PageProps<"/admin/problems">["searchParams"];
}) {
  await requirePermission("content.view");
  const query = await searchParams;
  const filters = {
    q: typeof query.q === "string" ? query.q.trim().slice(0, 100) || undefined : undefined,
    status: pick(query.status, STATUSES),
    difficulty: pick<Difficulty>(query.difficulty, ["EASY", "MEDIUM", "HARD"]),
    validation: pick(query.validation, ["passed", "pending"] as const),
    page: Math.max(1, Number(query.page) || 1),
  };
  const { rows, total } = await listAdminProblems(filters);
  const params = Object.fromEntries(
    Object.entries({
      q: filters.q,
      status: filters.status,
      difficulty: filters.difficulty,
      validation: filters.validation,
    }).filter((e): e is [string, string] => Boolean(e[1])),
  );

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter problems">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Title or ID"
            aria-label="Search"
            className="pl-8"
          />
        </div>
        <NativeSelect name="status" defaultValue={filters.status ?? ""} aria-label="Status">
          <NativeSelectOption value="">Any status</NativeSelectOption>
          {STATUSES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {STATUS_LABELS[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          name="difficulty"
          defaultValue={filters.difficulty ?? ""}
          aria-label="Difficulty"
        >
          <NativeSelectOption value="">Any difficulty</NativeSelectOption>
          <NativeSelectOption value="EASY">Easy</NativeSelectOption>
          <NativeSelectOption value="MEDIUM">Medium</NativeSelectOption>
          <NativeSelectOption value="HARD">Hard</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          name="validation"
          defaultValue={filters.validation ?? ""}
          aria-label="Judge check"
        >
          <NativeSelectOption value="">Any judge check</NativeSelectOption>
          <NativeSelectOption value="passed">Passed</NativeSelectOption>
          <NativeSelectOption value="pending">Not passed</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <DataTable
        caption="Coding problems"
        rows={rows}
        rowKey={(p) => p.id}
        emptyTitle="No coding problems"
        emptyDescription="Import coding-problems.csv, then test cases and solutions (or one ZIP package)."
        columns={[
          {
            key: "title",
            header: "Problem",
            cell: (p) => (
              <div className="min-w-0">
                <Link
                  href={`/admin/problems/${p.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {p.title}
                </Link>
                <p className="font-mono text-xs text-muted-foreground">{p.externalId}</p>
              </div>
            ),
          },
          {
            key: "difficulty",
            header: "Difficulty",
            hideOnMobile: true,
            cell: (p) => <DifficultyLabel difficulty={p.difficulty} />,
          },
          {
            key: "tests",
            header: "Tests / solutions",
            hideOnMobile: true,
            cell: (p) => (
              <span className="text-sm tabular-nums">
                {p._count.testCases} / {p._count.solutions}
              </span>
            ),
          },
          {
            key: "judge",
            header: "Judge check",
            cell: (p) => <Validation validatedAt={p.validatedAt} note={p.validationNote} />,
          },
          {
            key: "status",
            header: "Status",
            cell: (p) => <ContentStatusBadge status={p.status} />,
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
        page={filters.page}
        pageCount={Math.ceil(total / PROBLEM_PAGE_SIZE)}
        params={params}
        basePath="/admin/problems"
      />
    </div>
  );
}
