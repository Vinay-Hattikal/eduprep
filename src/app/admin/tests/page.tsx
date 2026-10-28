import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Plus, Wand2 } from "lucide-react";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { getBlueprintOptions, listBlueprints } from "@/server/services/blueprints";
import { KIND_LABELS } from "@/server/services/tests";

export const metadata: Metadata = { title: "Mock tests" };

export default function AdminTestsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Mock tests"
        description="A test is a blueprint: sections, timers and how many questions to draw from each topic. Each student gets their own draw."
        actions={
          <Button asChild>
            <Link href="/admin/tests/new">
              <Plus /> New test
            </Link>
          </Button>
        }
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Blueprints />
      </Suspense>
    </div>
  );
}

async function Blueprints() {
  const user = await requirePermission("content.view");
  const [blueprints, options] = await Promise.all([listBlueprints(), getBlueprintOptions()]);

  return (
    <div className="space-y-6">
      {can(user.roles, "content.edit") && options.companies.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Start from a company&apos;s test</h2>
            </CardTitle>
            <CardDescription>
              Copies the company&apos;s online-test sections, timers, negative marking and topics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action="/admin/tests/new" className="flex flex-wrap items-center gap-2">
              <NativeSelect name="company" aria-label="Company" required defaultValue="">
                <NativeSelectOption value="" disabled>
                  Choose a company
                </NativeSelectOption>
                {options.companies.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button type="submit" variant="secondary">
                <Wand2 /> Draft mock
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <DataTable
        caption="Mock tests"
        rows={blueprints}
        rowKey={(b) => b.id}
        emptyTitle="No tests yet"
        emptyDescription="Create a topic test, or draft a company mock from a company's test pattern."
        columns={[
          {
            key: "title",
            header: "Test",
            cell: (b) => (
              <div className="min-w-0">
                <Link
                  href={`/admin/tests/${b.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {b.title}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABELS[b.kind]}
                  {b.company ? ` · ${b.company.name}` : ""}
                </p>
              </div>
            ),
          },
          {
            key: "shape",
            header: "Size",
            hideOnMobile: true,
            cell: (b) => (
              <span className="text-sm tabular-nums">
                {b.sections.reduce((n, s) => n + s.rules.reduce((m, r) => m + r.count, 0), 0)} Q ·{" "}
                {b.sections.reduce((n, s) => n + s.minutes, 0)} min
              </span>
            ),
          },
          { key: "sittings", header: "Taken", hideOnMobile: true, cell: (b) => b._count.sittings },
          {
            key: "status",
            header: "Status",
            cell: (b) => <ContentStatusBadge status={b.status} />,
          },
          {
            key: "updated",
            header: "Updated",
            hideOnMobile: true,
            cell: (b) => formatDate(b.updatedAt),
          },
        ]}
      />
    </div>
  );
}
