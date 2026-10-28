import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CalendarClock, CheckCircle2, CircleAlert, Video } from "lucide-react";
import { cancelAction } from "@/app/(student)/interviews/actions";
import { RateForm, RescheduleForm } from "@/app/(student)/interviews/[bookingId]/forms";
import { BookingStatusBadge } from "@/components/interviews/booking-status";
import { ScorecardView } from "@/components/interviews/scorecard-view";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { withinFreeChangeWindow, type RubricItem, type Score } from "@/lib/interviews/policies";
import { formatSlot } from "@/lib/time/zones";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { getCandidateBooking, getSlots } from "@/server/services/interviews";
import { getSetting } from "@/server/services/settings";

export const metadata: Metadata = { title: "Mock interview" };

export default function BookingPage({
  params,
  searchParams,
}: PageProps<"/interviews/[bookingId]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/interviews">
          <ArrowLeft /> Mock interviews
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Booking params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Booking({ params, searchParams }: PageProps<"/interviews/[bookingId]">) {
  const user = await requirePermission("student.access");
  const { bookingId } = await params;
  const query = await searchParams;
  const booking = await getCandidateBooking(user.id, bookingId);
  if (!booking) notFound();
  const windowHours = await getSetting("interviews.rescheduleHours");
  const now = new Date();
  const canChange =
    booking.status === "CONFIRMED" && withinFreeChangeWindow(booking.startsAt, now, windowHours);
  const [slots, topics] = await Promise.all([
    canChange ? getSlots(booking.interviewerId, booking.type.slug) : [],
    booking.scorecard
      ? db.topic.findMany({
          where: { slug: { in: booking.scorecard.recommendedTopics } },
          select: { slug: true, name: true },
        })
      : [],
  ]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{booking.type.name}</h1>
          <BookingStatusBadge status={booking.status} />
        </div>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <CalendarClock className="size-4 text-muted-foreground" aria-hidden="true" />
          <span data-testid="booking-time">{formatSlot(booking.startsAt)} IST</span> ·{" "}
          {booking.type.durationMin} min · with {booking.interviewer.user.name} (
          {booking.interviewer.headline}){booking.company ? ` · for ${booking.company.name}` : ""}
        </p>
      </div>

      {query.booked ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>You&apos;re booked</AlertTitle>
          <AlertDescription>
            We&apos;ve emailed you and the interviewer. The meeting link appears here in a moment.
          </AlertDescription>
        </Alert>
      ) : null}
      {query.moved ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Moved</AlertTitle>
          <AlertDescription>The calendar invite is updated for both of you.</AlertDescription>
        </Alert>
      ) : null}
      {query.cancelled ? (
        <Alert>
          <AlertTitle>Cancelled</AlertTitle>
          <AlertDescription>
            {query.cancelled === "credit"
              ? "Your credit is back on your account; book another slot any time."
              : "This was inside the cancellation window, so the credit wasn't returned."}
          </AlertDescription>
        </Alert>
      ) : null}
      {typeof query.error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      ) : null}

      {booking.status === "CONFIRMED" ? (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            {booking.meetUrl ? (
              <Button asChild size="lg">
                <a
                  href={booking.meetUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="join-meeting"
                >
                  <Video /> Join the meeting
                </a>
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                The meeting link is being created. Refresh in a moment.
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Join a couple of minutes early with your camera and microphone on.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {booking.status === "CONFIRMED" ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Change or cancel</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {canChange ? (
              <p className="text-sm text-muted-foreground">
                Free up to {windowHours} hours before the start: you keep your credit.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Less than {windowHours} hours to go: the booking can&apos;t be moved, and cancelling
                now doesn&apos;t return the credit.
              </p>
            )}
            <div className="flex flex-wrap items-start gap-3">
              {canChange ? (
                <RescheduleForm bookingId={booking.id} slots={slots.map((s) => s.toISOString())} />
              ) : null}
              <form action={cancelAction}>
                <input type="hidden" name="bookingId" value={booking.id} />
                <Button
                  type="submit"
                  variant="ghost"
                  className="text-destructive"
                  data-testid="cancel-booking"
                >
                  Cancel booking
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {booking.scorecard ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Scorecard from {booking.interviewer.user.name}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <ScorecardView
              rubric={booking.type.rubric as RubricItem[]}
              scorecard={{ ...booking.scorecard, scores: booking.scorecard.scores as Score[] }}
              topics={topics}
            />
            {booking.rating ? (
              <p className="text-sm text-muted-foreground">
                You rated this interview {booking.rating.stars} / 5. Thank you!
              </p>
            ) : (
              <RateForm bookingId={booking.id} />
            )}
          </CardContent>
        </Card>
      ) : booking.status === "CONFIRMED" && booking.startsAt < now ? (
        <p className="text-sm text-muted-foreground">
          The interviewer will share your scorecard within a day. We&apos;ll email you.
        </p>
      ) : null}

      {booking.candidateNotes ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Your notes for the interviewer:</span>{" "}
          {booking.candidateNotes}
        </p>
      ) : null}
    </div>
  );
}
