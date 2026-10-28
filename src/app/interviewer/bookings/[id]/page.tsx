import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, Video } from "lucide-react";
import { candidateNoShowAction, interviewerCancelAction } from "@/app/interviewer/actions";
import { ScorecardForm } from "@/app/interviewer/bookings/[id]/scorecard-form";
import { BookingStatusBadge } from "@/components/interviews/booking-status";
import { ScorecardView } from "@/components/interviews/scorecard-view";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { RubricItem, Score } from "@/lib/interviews/policies";
import { formatSlot } from "@/lib/time/zones";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { getInterviewerBooking } from "@/server/services/interviews";

export const metadata: Metadata = { title: "Interview" };

export default function InterviewerBookingPage({
  params,
  searchParams,
}: PageProps<"/interviewer/bookings/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/interviewer/bookings">
          <ArrowLeft /> Interviews
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}

async function Detail({ params, searchParams }: PageProps<"/interviewer/bookings/[id]">) {
  const user = await requirePermission("interviewer.access");
  const { id } = await params;
  const query = await searchParams;
  const data = await getInterviewerBooking(user.id, id);
  if (!data) notFound();
  const { booking, candidate, weakTopics, stats } = data;
  const tz = booking.interviewer.timeZone;
  const started = booking.startsAt <= new Date();
  const topics =
    booking.status === "CONFIRMED" && started
      ? await db.topic.findMany({
          orderBy: [{ subject: { order: "asc" } }, { order: "asc" }],
          select: { slug: true, name: true },
        })
      : [];
  const rubric = booking.type.rubric as RubricItem[];
  const fp = candidate.fresherProfile;
  const ep = candidate.experiencedProfile;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {booking.type.name}: {candidate.name}
          </h1>
          <BookingStatusBadge status={booking.status} />
        </div>
        <p className="text-sm">
          {formatSlot(booking.startsAt, tz)} ({tz}) · {booking.type.durationMin} min
          {booking.company ? ` · for ${booking.company.name}` : ""}
        </p>
      </div>
      {query.submitted ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Scorecard sent</AlertTitle>
          <AlertDescription>
            The candidate has been notified, and the earning is in your balance.
          </AlertDescription>
        </Alert>
      ) : null}
      {typeof query.error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      ) : null}

      {booking.status === "CONFIRMED" && booking.meetUrl ? (
        <Button asChild size="lg">
          <a href={booking.meetUrl} target="_blank" rel="noreferrer">
            <Video /> Join the meeting
          </a>
        </Button>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Candidate</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <dl className="space-y-1.5">
              <Fact
                label="Profile"
                value={
                  candidate.profileType === "EXPERIENCED"
                    ? "Experienced"
                    : candidate.profileType === "FRESHER"
                      ? "Fresher"
                      : null
                }
              />
              <Fact label="College" value={fp?.college} />
              <Fact
                label="Degree"
                value={fp ? [fp.degree, fp.branch, fp.gradYear].filter(Boolean).join(", ") : null}
              />
              <Fact
                label="Role"
                value={ep ? [ep.currentRole, ep.currentCompany].filter(Boolean).join(" at ") : null}
              />
              <Fact
                label="Experience"
                value={ep?.yearsExperience ? `${ep.yearsExperience} years` : null}
              />
              <Fact label="Codes in" value={candidate.preferredLanguage} />
              <Fact
                label="Targets"
                value={candidate.targetCompanies.map((t) => t.company.name).join(", ") || null}
              />
              <Fact
                label="Questions practised"
                value={
                  stats?.totalAttempts
                    ? `${stats.totalAttempts} (${Math.round((stats.totalCorrect / stats.totalAttempts) * 100)}% right)`
                    : null
                }
              />
            </dl>
            {weakTopics.length ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">Weakest topics</p>
                <ul className="text-sm text-muted-foreground">
                  {weakTopics.map((t) => (
                    <li key={t.name}>
                      {t.name}: {t.score}%
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {booking.candidateNotes ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">They asked you to focus on</p>
                <p className="text-sm">{booking.candidateNotes}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Scorecard</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {booking.scorecard ? (
              <ScorecardView
                rubric={rubric}
                scorecard={{ ...booking.scorecard, scores: booking.scorecard.scores as Score[] }}
                topics={[]}
              />
            ) : booking.status === "CONFIRMED" && started ? (
              <>
                <ScorecardForm bookingId={booking.id} rubric={rubric} topics={topics} />
                <form action={candidateNoShowAction} className="border-t pt-4">
                  <input type="hidden" name="bookingId" value={booking.id} />
                  <p className="mb-2 text-sm text-muted-foreground">
                    Candidate didn&apos;t join within 10 minutes?
                  </p>
                  <Button type="submit" variant="outline" size="sm">
                    Mark candidate as no-show
                  </Button>
                </form>
              </>
            ) : booking.status === "CONFIRMED" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  The scorecard opens when the interview starts.
                </p>
                <form
                  action={interviewerCancelAction}
                  className="flex flex-wrap items-end gap-2 border-t pt-4"
                >
                  <div className="min-w-56 flex-1 space-y-1">
                    <label htmlFor="reason" className="text-sm text-muted-foreground">
                      Can&apos;t make it? Cancel at least 24 hours before (the candidate gets their
                      credit back).
                    </label>
                    <Input
                      id="reason"
                      name="reason"
                      placeholder="Reason for the candidate"
                      maxLength={200}
                    />
                  </div>
                  <Button type="submit" variant="ghost" className="text-destructive">
                    Cancel interview
                  </Button>
                </form>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No scorecard for this booking.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
