import type { Metadata } from "next";
import { Suspense } from "react";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { VerdictBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { getJobOverview, retryJob } from "@/server/services/ops";

export const metadata: Metadata = { title: "Jobs and judge" };

async function retryJobAction(formData: FormData) {
  "use server";
  await requirePermission("jobs.view");
  await retryJob(z.string().min(1).max(40).parse(formData.get("id")));
  revalidatePath("/admin/jobs");
}

export default function JobsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Jobs and judge"
        description="Background work: imports, code judging, problem checks and test auto-submits. Refreshes every few seconds."
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Overview />
      </Suspense>
    </div>
  );
}

async function Overview() {
  await requirePermission("jobs.view");
  const data = await getJobOverview();
  const queued = data.table.reduce((n, r) => n + r.queued, 0);

  return (
    <div className="space-y-6">
      <AutoRefresh intervalMs={5000} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Waiting jobs"
          value={queued}
          hint={
            data.backlogSeconds ? `oldest waiting ${data.backlogSeconds}s` : "worker is keeping up"
          }
        />
        <StatCard
          label="Judge"
          value={data.judge.name}
          hint={`${data.judge.pending} submissions in the queue`}
        />
        <StatCard
          label="Judged (24 h)"
          value={data.judge.last24h}
          hint={
            data.judge.avgRuntimeMs !== null ? `average ${data.judge.avgRuntimeMs} ms` : undefined
          }
        />
        <StatCard
          label="Failed jobs"
          value={data.failed.length}
          hint={data.failed.length ? "see below" : "none"}
        />
      </div>
      {data.backlogSeconds > 60 ? (
        <p className="text-sm font-medium text-warning" role="status">
          Jobs have been waiting over a minute. Is the worker running? (`npm run worker`)
        </p>
      ) : null}

      <DataTable
        caption="Jobs by type"
        rows={data.table}
        rowKey={(r) => r.type}
        emptyTitle="No jobs yet"
        columns={[
          {
            key: "type",
            header: "Job",
            cell: (r) => <span className="font-mono text-sm">{r.type}</span>,
          },
          { key: "queued", header: "Waiting", cell: (r) => r.queued },
          { key: "running", header: "Running", cell: (r) => r.running },
          { key: "done", header: "Done", hideOnMobile: true, cell: (r) => r.done },
          {
            key: "failed",
            header: "Failed",
            cell: (r) => (
              <span className={r.failed ? "font-medium text-destructive" : ""}>{r.failed}</span>
            ),
          },
        ]}
      />

      {data.judge.verdicts.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Verdicts in the last 24 hours</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {data.judge.verdicts.map((v) => (
              <span key={v.verdict} className="inline-flex items-center gap-2 text-sm">
                <VerdictBadge verdict={v.verdict} /> <span className="tabular-nums">{v.count}</span>
              </span>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {data.failed.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Failed jobs</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {data.failed.map((job) => (
                <li key={job.id} className="space-y-2 py-3 first:pt-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono">{job.type}</span>
                    <span className="text-muted-foreground">
                      {job.attempts} attempts · {formatDateTime(job.updatedAt)}
                    </span>
                    <form action={retryJobAction} className="ml-auto">
                      <input type="hidden" name="id" value={job.id} />
                      <Button type="submit" size="sm" variant="outline">
                        Retry
                      </Button>
                    </form>
                  </div>
                  <pre className="max-h-32 overflow-auto rounded-md border bg-surface p-2 font-mono text-xs whitespace-pre-wrap">
                    {(job.lastError ?? "").split("\n").slice(0, 6).join("\n")}
                  </pre>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
