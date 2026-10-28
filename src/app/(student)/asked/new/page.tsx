import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DriveReportForm } from "@/app/(student)/asked/new/report-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ROUND_TYPE_LABELS } from "@/lib/content/companies";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { listMyDriveReports } from "@/server/services/drive-reports";
import { getSetting } from "@/server/services/settings";

export const metadata: Metadata = { title: "What was asked today?" };

const STATUS = {
  PENDING: "Waiting for review",
  APPROVED: "Published",
  REJECTED: "Not published",
} as const;

export default function AskedTodayPage({ searchParams }: PageProps<"/asked/new">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Just had a drive? Tell us what was asked"
        description="Two minutes, while it's fresh. It helps everyone taking the same test this week."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Report searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Report({ searchParams }: { searchParams: PageProps<"/asked/new">["searchParams"] }) {
  const user = await requirePermission("student.access");
  const { company } = await searchParams;
  const [companies, mine, points] = await Promise.all([
    db.company.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, slug: true },
    }),
    listMyDriveReports(user.id),
    getSetting("points.driveReportApproved"),
  ]);
  const defaultCompany = companies.find((c) => c.slug === company)?.id;
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardContent className="pt-6">
          <DriveReportForm companies={companies} defaultCompany={defaultCompany} />
        </CardContent>
      </Card>
      <aside className="space-y-3">
        <p className="text-sm text-muted-foreground">
          You earn {points} points for each published report. For the full story of your rounds,{" "}
          <Link href="/experiences/new" className="text-primary hover:underline">
            share an interview experience
          </Link>
          .
        </p>
        {mine.length ? (
          <ul className="space-y-2">
            {mine.map((report) => (
              <li key={report.id} className="rounded-lg border p-3 text-sm">
                <Link
                  href={`/companies/${report.company.slug}`}
                  className="font-medium hover:underline"
                >
                  {report.company.name}
                </Link>{" "}
                · {ROUND_TYPE_LABELS[report.roundType]}
                <div className="mt-1 flex items-center gap-2">
                  <Badge variant="outline">{STATUS[report.status]}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(report.driveDate)}
                  </span>
                </div>
                {report.status === "REJECTED" && report.moderatorNote ? (
                  <p className="mt-1 text-xs text-muted-foreground">{report.moderatorNote}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </aside>
    </div>
  );
}
