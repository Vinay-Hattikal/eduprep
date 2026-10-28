import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CalendarClock, CircleAlert } from "lucide-react";
import {
  bookFreeAction,
  payBookingAction,
  useCreditAction,
} from "@/app/(student)/interviews/actions";
import { HoldCountdown } from "@/components/interviews/hold-countdown";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRupees } from "@/lib/commerce/pricing";
import { formatSlot } from "@/lib/time/zones";
import { requirePermission } from "@/server/auth";
import { env } from "@/server/env";
import { getInterviewType } from "@/server/services/interview-types";
import { availableCredits, getCandidateBooking } from "@/server/services/interviews";
import { getSetting } from "@/server/services/settings";

export const metadata: Metadata = { title: "Confirm your interview", robots: { index: false } };

export default function ConfirmPage({
  params,
  searchParams,
}: PageProps<"/interviews/checkout/[bookingId]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/interviews">
          <ArrowLeft /> Mock interviews
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Confirm params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Confirm({ params, searchParams }: PageProps<"/interviews/checkout/[bookingId]">) {
  const user = await requirePermission("student.access");
  const { bookingId } = await params;
  const error = (await searchParams).error;
  const booking = await getCandidateBooking(user.id, bookingId);
  if (!booking) notFound();
  if (booking.status === "CONFIRMED" || booking.status === "COMPLETED")
    redirect(`/interviews/${booking.id}`);
  if (booking.status !== "HELD" && booking.status !== "EXPIRED") redirect("/interviews");
  const [type, credits, windowHours] = await Promise.all([
    getInterviewType(booking.type.slug),
    availableCredits(user.id),
    getSetting("interviews.rescheduleHours"),
  ]);
  const credit = credits.get(type!.id) ?? 0;

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">Confirm your interview</h1>
        </CardTitle>
        <CardDescription>
          {booking.type.name} with {booking.interviewer.user.name}
          {booking.company ? ` · for ${booking.company.name}` : ""}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="flex items-center gap-2 font-medium">
          <CalendarClock className="size-5 text-primary" aria-hidden="true" />{" "}
          {formatSlot(booking.startsAt)} IST · {booking.type.durationMin} min
        </p>
        {booking.holdExpiresAt ? (
          <HoldCountdown until={booking.holdExpiresAt.toISOString()} />
        ) : null}
        {typeof error === "string" ? (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {env().TEST_MODE && !credit ? (
          <form action={bookFreeAction} className="space-y-2">
            <input type="hidden" name="bookingId" value={booking.id} />
            <Button type="submit" size="lg" className="w-full" data-testid="book-free">
              Confirm booking
            </Button>
            <p className="text-xs text-muted-foreground">Test mode: no payment needed.</p>
          </form>
        ) : credit ? (
          <form action={useCreditAction} className="space-y-2">
            <input type="hidden" name="bookingId" value={booking.id} />
            <Button type="submit" size="lg" className="w-full" data-testid="use-credit">
              Use 1 credit ({credit} available)
            </Button>
          </form>
        ) : (
          <form action={payBookingAction} className="space-y-3">
            <input type="hidden" name="bookingId" value={booking.id} />
            <div className="space-y-1.5">
              <Label htmlFor="code">Coupon or referral code (optional)</Label>
              <Input id="code" name="code" className="font-mono uppercase" maxLength={40} />
            </div>
            <Button type="submit" size="lg" className="w-full" data-testid="pay-booking">
              Pay {formatRupees(type!.pricePaise)}
            </Button>
            <p className="text-xs text-muted-foreground">
              Booking several? Bundles of 3 or 5 are cheaper on the{" "}
              <Link href="/pricing" className="underline">
                pricing page
              </Link>
              .
            </p>
          </form>
        )}
        <p className="text-xs text-muted-foreground">
          Free to move or cancel up to {windowHours} hours before; you get the credit back.
        </p>
      </CardContent>
    </Card>
  );
}
