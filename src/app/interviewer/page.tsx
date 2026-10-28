import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AlertTriangle, CalendarClock, ClipboardCheck, Star, Wallet } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatRupees } from "@/lib/commerce/pricing";
import { formatSlot } from "@/lib/time/zones";
import { requirePermission } from "@/server/auth";
import { interviewerDashboard } from "@/server/services/interviews";

export const metadata: Metadata = { title: "Interviewer" };

export default function InterviewerPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <InterviewerOverview />
    </Suspense>
  );
}

type Row = { id: string; startsAt: Date; type: { name: string }; candidate: { name: string } };

function BookingRow({ b, timeZone, action }: { b: Row; timeZone: string; action: string }) {
  return (
    <li>
      <Link
        href={`/interviewer/bookings/${b.id}`}
        className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-secondary/40"
      >
        <span className="min-w-0 flex-1">
          <span className="font-medium">{b.candidate.name}</span>
          <span className="text-muted-foreground"> · {b.type.name}</span>
        </span>
        <span className="text-sm tabular-nums">{formatSlot(b.startsAt, timeZone)}</span>
        <span className="text-sm font-medium text-primary">{action}</span>
      </Link>
    </li>
  );
}

async function InterviewerOverview() {
  const user = await requirePermission("interviewer.access");
  const data = await interviewerDashboard(user.id);
  const tz = data.profile?.timeZone ?? "Asia/Kolkata";

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Hello, ${user.name.split(" ")[0]}`}
        description={`Your upcoming interviews, scorecards due and earnings. Times are in ${tz}.`}
      />
      {!data.profile || data.profile.status !== "APPROVED" ? (
        <Alert>
          <AlertTitle>Your interviewer profile isn&apos;t active</AlertTitle>
          <AlertDescription>
            {data.profile ? (
              "Contact the team to reactivate it."
            ) : (
              <Link href="/become-interviewer" className="underline">
                Apply to interview
              </Link>
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {data.profile?.flaggedAt ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Your profile is under review</AlertTitle>
          <AlertDescription>
            Recent ratings or a missed interview triggered a quality check. The team will be in
            touch.
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Upcoming interviews" value={data.upcoming.length} icon={CalendarClock} />
        <StatCard label="Scorecards due" value={data.due.length} icon={ClipboardCheck} />
        <StatCard
          label="Earned this month"
          value={formatRupees(data.monthPaise)}
          hint={`Balance ${formatRupees(data.balancePaise)}`}
          icon={Wallet}
        />
        <StatCard
          label="Rating"
          value={data.rating ?? "New"}
          hint={data.profile ? `${data.profile.ratingCount} ratings` : undefined}
          icon={Star}
        />
      </div>

      {data.due.length ? (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Scorecards due</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {data.due.map((b) => (
              <BookingRow key={b.id} b={b} timeZone={tz} action="Write scorecard" />
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Upcoming</h2>
        {data.upcoming.length ? (
          <ul className="divide-y rounded-xl border bg-card" data-testid="interviewer-upcoming">
            {data.upcoming.map((b) => (
              <BookingRow key={b.id} b={b} timeZone={tz} action="Prepare" />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CalendarClock}
            title="No interviews booked yet"
            description="Make sure your weekly hours are set so candidates can find free slots."
            action={
              <Button asChild variant="outline">
                <Link href="/interviewer/availability">Set availability</Link>
              </Button>
            }
          />
        )}
      </section>
    </div>
  );
}
