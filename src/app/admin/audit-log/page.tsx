import type { Metadata } from "next";
import { Suspense } from "react";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Audit log" };

export default function AuditLogPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Every admin action: who did what, and when. Latest 100."
      />
      <Suspense fallback={<TableSkeleton />}>
        <AuditTable />
      </Suspense>
    </div>
  );
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return "—";
  return JSON.stringify(value);
}

async function AuditTable() {
  await requirePermission("audit.view");

  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { actor: { select: { name: true } } },
  });

  return (
    <DataTable
      caption="Audit log entries"
      rows={entries}
      rowKey={(entry) => entry.id}
      emptyTitle="No admin actions yet"
      emptyDescription="Changes made in the admin panel, such as editing settings, appear here."
      columns={[
        {
          key: "when",
          header: "When",
          className: "whitespace-nowrap text-muted-foreground",
          cell: (entry) => formatDateTime(entry.createdAt),
        },
        {
          key: "who",
          header: "Who",
          cell: (entry) => entry.actor?.name ?? "System",
        },
        {
          key: "action",
          header: "Action",
          cell: (entry) => (
            <div className="space-y-1">
              <Badge variant="secondary" className="font-mono">
                {entry.action}
              </Badge>
              {entry.entityId ? (
                <p className="font-mono text-xs text-muted-foreground">{entry.entityId}</p>
              ) : null}
            </div>
          ),
        },
        {
          key: "change",
          header: "Change",
          hideOnMobile: true,
          cell: (entry) => (
            <p className="font-mono text-xs">
              <span className="text-muted-foreground">{describe(entry.before)}</span>
              {" → "}
              <span>{describe(entry.after)}</span>
            </p>
          ),
        },
      ]}
    />
  );
}
