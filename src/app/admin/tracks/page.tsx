import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FileUp, Plus } from "lucide-react";
import { setTrackVisibleAction } from "@/app/admin/tracks/actions";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { listAdminTracks } from "@/server/services/role-tracks";

export const metadata: Metadata = { title: "Role tracks" };

const AUDIENCE_LABELS = { FRESHER: "Freshers", EXPERIENCED: "Experienced", BOTH: "Both" } as const;

export default function TracksAdminPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Role tracks"
        description="Career tracks such as “Service to product switch”: topics, a roadmap and suggested interviews."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/admin/imports">
                <FileUp /> Import
              </Link>
            </Button>
            <Button asChild>
              <Link href="/admin/tracks/new">
                <Plus /> New track
              </Link>
            </Button>
          </>
        }
      />
      <Suspense fallback={<TableSkeleton rows={5} />}>
        <Tracks />
      </Suspense>
    </div>
  );
}

async function Tracks() {
  const user = await requirePermission("content.view");
  const tracks = await listAdminTracks();
  const canManage = can(user.roles, "taxonomy.manage");
  return (
    <DataTable
      caption="Role tracks"
      rows={tracks}
      rowKey={(t) => t.id}
      emptyTitle="No role tracks"
      emptyDescription="Create one with New track, or import tracks/role-tracks.csv."
      columns={[
        {
          key: "name",
          header: "Track",
          cell: (t) => (
            <div>
              <Link
                href={`/admin/tracks/${t.id}`}
                className="font-medium text-primary hover:underline"
              >
                {t.name}
              </Link>
              <p className="font-mono text-xs text-muted-foreground">{t.slug}</p>
            </div>
          ),
        },
        {
          key: "audience",
          header: "For",
          hideOnMobile: true,
          cell: (t) => AUDIENCE_LABELS[t.audience],
        },
        {
          key: "topics",
          header: "Topics",
          hideOnMobile: true,
          cell: (t) => <span className="tabular-nums">{t._count.topics}</span>,
        },
        { key: "order", header: "Order", hideOnMobile: true, cell: (t) => t.order },
        {
          key: "status",
          header: "Status",
          cell: (t) =>
            t.status === "PUBLISHED" ? (
              <Badge variant="outline" className="border-success/30 bg-success/10 text-success">
                Shown
              </Badge>
            ) : (
              <Badge variant="outline">Hidden</Badge>
            ),
        },
        {
          key: "actions",
          header: "",
          cell: (t) =>
            canManage ? (
              <form action={setTrackVisibleAction}>
                <input type="hidden" name="id" value={t.id} />
                <input
                  type="hidden"
                  name="visible"
                  value={t.status === "PUBLISHED" ? "no" : "yes"}
                />
                <Button type="submit" size="sm" variant="ghost">
                  {t.status === "PUBLISHED" ? "Hide" : "Show"}
                </Button>
              </form>
            ) : null,
        },
      ]}
    />
  );
}
