import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  ClipboardList,
  FileCheck2,
  FileQuestion,
  FileWarning,
  Flag,
  GraduationCap,
  ListChecks,
  Megaphone,
  MessageCircle,
  ScrollText,
  ServerCrash,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { can, type Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth";
import { getAdminOverviewStats } from "@/server/services/admin-stats";

export const metadata: Metadata = { title: "Admin" };

type Queue = {
  label: string;
  icon: LucideIcon;
  count?: number;
  href?: string;
  permission: Permission;
  /** Build phase that brings this queue, when it isn't live yet. */
  phase?: number;
  tone?: "warning" | "danger";
};

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <AdminOverview />
    </Suspense>
  );
}

async function AdminOverview() {
  const user = await requirePermission("admin.access");
  const stats = await getAdminOverviewStats();

  // Work queues from PRD 9.1.
  const allQueues: Queue[] = [
    {
      label: "Questions waiting for review",
      icon: ListChecks,
      count: stats.queues.inReview,
      href: "/admin/review",
      permission: "content.publish",
    },
    {
      label: "Imports waiting for confirmation",
      icon: FileCheck2,
      count: stats.queues.importsAwaitingConfirmation,
      href: "/admin/imports",
      permission: "imports.view",
    },
    {
      label: "Failed imports (7 days)",
      icon: FileWarning,
      count: stats.queues.failedImports,
      href: "/admin/imports",
      permission: "imports.view",
      tone: "danger",
    },
    {
      label: "Companies not verified for 6 months",
      icon: Building2,
      count: stats.queues.staleCompanies,
      href: "/admin/companies",
      permission: "companies.manage",
      tone: "warning",
    },
    {
      label: "Background jobs that failed (7 days)",
      icon: ServerCrash,
      count: stats.queues.stuckJobs,
      permission: "settings.manage",
      tone: "danger",
    },
    {
      label: "Open error reports",
      icon: Flag,
      count: stats.queues.openReports,
      href: "/admin/reports",
      permission: "content.edit",
      tone: "warning",
    },
    {
      label: "Drive reports to check",
      icon: Megaphone,
      count: stats.queues.pendingDriveReports,
      href: "/admin/drive-reports",
      permission: "experiences.moderate",
      tone: "warning",
    },
    {
      label: "Flagged discussion comments",
      icon: MessageCircle,
      count: stats.queues.flaggedComments,
      href: "/admin/discussions",
      permission: "discussions.moderate",
      tone: "warning",
    },
    {
      label: "Interviewer applications",
      icon: ClipboardList,
      phase: 5,
      permission: "admin.access",
    },
  ];
  const queues = allQueues.filter((queue) => can(user.roles, queue.permission));

  return (
    <div className="space-y-8">
      <PageHeader title="Overview" description={`Signed in as ${user.name}.`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Published questions"
          value={stats.questions.published}
          icon={FileQuestion}
          hint={`${stats.questions.total} in the bank`}
        />
        <StatCard label="Students" value={stats.students} icon={GraduationCap} />
        <StatCard label="Admin users" value={stats.admins} icon={ShieldCheck} />
        <StatCard
          label="Admin actions (7 days)"
          value={stats.auditThisWeek}
          icon={ScrollText}
          hint={
            can(user.roles, "audit.view") ? (
              <Link href="/admin/audit-log" className="text-primary hover:underline">
                View audit log
              </Link>
            ) : undefined
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s queues</CardTitle>
          <CardDescription>Items waiting for an admin.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {queues.map((queue) => {
              const active = (queue.count ?? 0) > 0;
              const content = (
                <>
                  <queue.icon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-sm">{queue.label}</span>
                  {queue.phase ? <Badge variant="outline">Phase {queue.phase}</Badge> : null}
                  {active && queue.tone ? (
                    <AlertTriangle
                      className={cn(
                        "size-4",
                        queue.tone === "danger" ? "text-destructive" : "text-warning",
                      )}
                      aria-hidden="true"
                    />
                  ) : null}
                  <span
                    className={cn(
                      "tabular w-8 text-right text-sm font-medium",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {queue.count ?? 0}
                  </span>
                  {queue.href ? (
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  ) : null}
                </>
              );
              return (
                <li key={queue.label}>
                  {queue.href ? (
                    <Link
                      href={queue.href}
                      className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-muted/50"
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 py-3">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
