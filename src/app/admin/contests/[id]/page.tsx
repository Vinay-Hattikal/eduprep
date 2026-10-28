import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, Copy, ExternalLink } from "lucide-react";
import { contestStatusAction } from "@/app/admin/contests/actions";
import { ContestForm } from "@/app/admin/contests/contest-form";
import { PhaseBadge } from "@/components/contests/phase-badge";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { contestPhase, resultsAt } from "@/lib/contests/ranking";
import { formatDateTime } from "@/lib/format";
import { toIstInput } from "@/schemas/contest";
import { requirePermission } from "@/server/auth";
import { contestFormatOptions, getContestForAdmin, leaderboard } from "@/server/services/contests";
import type { SectionSnapshot } from "@/server/services/tests";

export const metadata: Metadata = { title: "All-India mock" };

export default function ContestAdminPage({
  params,
  searchParams,
}: PageProps<"/admin/contests/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/contests">
          <ArrowLeft /> All-India mocks
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <ContestDetail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const MESSAGES: Record<string, string> = {
  saved: "Saved.",
  copied: "Copied to next week as a draft. Check the times, then publish.",
  publish: "Published. The question set is frozen and results are scheduled.",
  unpublish: "Back to draft.",
};

async function ContestDetail({ params, searchParams }: PageProps<"/admin/contests/[id]">) {
  await requirePermission("contests.manage");
  const { id } = await params;
  const query = await searchParams;
  const [contest, blueprints] = await Promise.all([getContestForAdmin(id), contestFormatOptions()]);
  if (!contest) notFound();
  const sections = contest.sections as SectionSnapshot[];
  const minutes = sections.reduce((n, s) => n + s.minutes, 0);
  const times = { startsAt: contest.startsAt, endsAt: contest.endsAt, durationMinutes: minutes };
  const phase = contestPhase(times, new Date());
  const board = contest.status === "PUBLISHED" ? await leaderboard(contest.id, 10) : [];
  const message =
    (query.saved && MESSAGES.saved) ||
    (query.copied && MESSAGES.copied) ||
    (typeof query.done === "string" && MESSAGES[query.done]) ||
    null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={contest.title}
        description={`${contest.blueprint.title} · opens ${formatDateTime(contest.startsAt)}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {contest.status === "PUBLISHED" ? (
              <Button asChild variant="ghost">
                <Link href={`/contests/${contest.slug}`} target="_blank">
                  View <ExternalLink />
                </Link>
              </Button>
            ) : null}
            <form action={contestStatusAction}>
              <input type="hidden" name="id" value={contest.id} />
              <Button type="submit" name="action" value="copy" variant="outline">
                <Copy /> Copy to next week
              </Button>
            </form>
            {contest.status === "DRAFT" ? (
              <form action={contestStatusAction}>
                <input type="hidden" name="id" value={contest.id} />
                <Button type="submit" name="action" value="publish">
                  Publish
                </Button>
              </form>
            ) : contest._count.sittings === 0 ? (
              <form action={contestStatusAction}>
                <input type="hidden" name="id" value={contest.id} />
                <Button type="submit" name="action" value="unpublish" variant="outline">
                  Back to draft
                </Button>
              </form>
            ) : null}
          </div>
        }
      />
      {typeof query.error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      ) : message ? (
        <Alert>
          <CheckCircle2 />
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Status"
          value={
            contest.status === "PUBLISHED" ? (
              <PhaseBadge phase={phase} />
            ) : (
              <ContentStatusBadge status={contest.status} />
            )
          }
        />
        <StatCard
          label="Students"
          value={contest._count.sittings.toLocaleString("en-IN")}
          hint={
            contest.status === "PUBLISHED"
              ? `${contest._count.items} questions frozen`
              : "Not published"
          }
        />
        <StatCard
          label="Results final"
          value={contest.status === "PUBLISHED" ? formatDateTime(resultsAt(times)) : "—"}
          hint={contest.finalizedAt ? "Ranks frozen, students told" : "Ranks are live until then"}
        />
      </div>

      {board.length ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Top 10</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="divide-y text-sm">
              {board.map((row) => (
                <li key={row.sittingId} className="flex justify-between gap-3 py-2">
                  <span>
                    {row.rank}. {row.name}
                  </span>
                  <span className="tabular">
                    {row.score}/{row.maxScore}
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      <ContestForm
        blueprints={blueprints}
        readOnly={contest.status !== "DRAFT"}
        values={{
          id: contest.id,
          title: contest.title,
          slug: contest.slug,
          description: contest.description ?? "",
          blueprintId: contest.blueprintId,
          startsAt: toIstInput(contest.startsAt),
          endsAt: toIstInput(contest.endsAt),
        }}
      />
    </div>
  );
}
