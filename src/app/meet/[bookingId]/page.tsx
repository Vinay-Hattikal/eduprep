import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FlaskConical, Video } from "lucide-react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSlot } from "@/lib/time/zones";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";

export const metadata: Metadata = { title: "Meeting room", robots: { index: false } };

// The development meeting provider's "room" (D-041). In production the link is a Google Meet.
export default function MeetPage({ params }: PageProps<"/meet/[bookingId]">) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <Suspense fallback={<PageSkeleton />}>
        <Room params={params} />
      </Suspense>
    </main>
  );
}

async function Room({ params }: { params: PageProps<"/meet/[bookingId]">["params"] }) {
  const user = await requireUser();
  const { bookingId } = await params;
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      type: { select: { name: true } },
      candidate: { select: { name: true } },
      interviewer: { select: { userId: true, user: { select: { name: true } } } },
    },
  });
  if (!booking || (booking.candidateId !== user.id && booking.interviewerId !== user.id))
    notFound();
  const back =
    booking.candidateId === user.id
      ? `/interviews/${booking.id}`
      : `/interviewer/bookings/${booking.id}`;

  return (
    <Card data-testid="meeting-room">
      <CardHeader>
        <Video className="size-10 text-primary" aria-hidden="true" />
        <CardTitle>
          <h1 className="text-xl">{booking.type.name} mock interview</h1>
        </CardTitle>
        <CardDescription>
          {booking.candidate.name} with {booking.interviewer.user.name} ·{" "}
          {formatSlot(booking.startsAt)} IST
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          <p>
            <strong>Test meeting room.</strong> Video calls are switched on with Google Meet at
            launch; this page stands in for the meeting link during development.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={back}>Back to the booking</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
