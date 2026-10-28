import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileQuestion, Plus, Search } from "lucide-react";
import { QuestionsTable } from "@/app/admin/questions/questions-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Pagination } from "@/components/shared/pagination";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ContentStatus, Difficulty, QuestionType } from "@/generated/prisma/enums";
import { STATUS_LABELS, type QuestionAction } from "@/lib/content/workflow";
import { formatDate, plainExcerpt } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { getTaxonomyTree, listQuestions } from "@/server/services/questions";

export const metadata: Metadata = { title: "Questions" };

const STATUSES = Object.keys(STATUS_LABELS) as ContentStatus[];

function pick<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

export default function QuestionsPage({ searchParams }: PageProps<"/admin/questions">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Questions"
        description="The question bank. Import files on the Imports page, or write questions one at a time."
        actions={
          <Button asChild>
            <Link href="/admin/questions/new">
              <Plus /> New question
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <QuestionBank searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function QuestionBank({
  searchParams,
}: {
  searchParams: PageProps<"/admin/questions">["searchParams"];
}) {
  const user = await requirePermission("content.view");
  const query = await searchParams;
  const filters = {
    q: typeof query.q === "string" ? query.q.trim().slice(0, 100) || undefined : undefined,
    subject: typeof query.subject === "string" ? query.subject || undefined : undefined,
    status: pick(query.status, STATUSES),
    difficulty: pick<Difficulty>(query.difficulty, ["EASY", "MEDIUM", "HARD"]),
    type: pick<QuestionType>(query.type, ["SINGLE", "MULTIPLE", "NUMERIC"]),
    page: Number(query.page) || 1,
  };
  const [result, taxonomy] = await Promise.all([listQuestions(filters), getTaxonomyTree()]);

  const bulkActions: QuestionAction[] = [
    ...(can(user.roles, "content.edit") ? (["submit"] as const) : []),
    ...(can(user.roles, "content.publish") ? (["approve", "archive", "restore"] as const) : []),
  ];

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap items-end gap-2" role="search" aria-label="Filter questions">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Search text or ID"
            aria-label="Search"
            className="pl-8"
          />
        </div>
        <NativeSelect name="subject" defaultValue={filters.subject ?? ""} aria-label="Subject">
          <NativeSelectOption value="">All subjects</NativeSelectOption>
          {taxonomy.map((s) => (
            <NativeSelectOption key={s.slug} value={s.slug}>
              {s.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
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
        <NativeSelect name="type" defaultValue={filters.type ?? ""} aria-label="Type">
          <NativeSelectOption value="">Any type</NativeSelectOption>
          <NativeSelectOption value="SINGLE">Single</NativeSelectOption>
          <NativeSelectOption value="MULTIPLE">Multiple</NativeSelectOption>
          <NativeSelectOption value="NUMERIC">Numeric</NativeSelectOption>
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      <p className="tabular text-sm text-muted-foreground">
        {result.total} question{result.total === 1 ? "" : "s"}
      </p>

      {result.items.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="No questions match"
          description="Change the filters, or import a subject file on the Imports page."
          action={
            <Button asChild variant="outline">
              <Link href="/admin/imports">Go to imports</Link>
            </Button>
          }
        />
      ) : (
        <QuestionsTable
          bulkActions={bulkActions}
          rows={result.items.map((q) => ({
            id: q.id,
            externalId: q.externalId,
            excerpt: plainExcerpt(q.text, 160),
            subject: q.subject.name,
            topic: q.topic.name,
            type: q.type,
            difficulty: q.difficulty,
            status: q.status,
            updated: formatDate(q.updatedAt),
          }))}
        />
      )}

      <Pagination
        page={result.page}
        pageCount={result.pageCount}
        basePath="/admin/questions"
        params={{
          q: filters.q,
          subject: filters.subject,
          status: filters.status,
          difficulty: filters.difficulty,
          type: filters.type,
        }}
      />
    </div>
  );
}
