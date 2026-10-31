import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowRight, Clock3, Video } from "lucide-react";
import { BookingStatusBadge } from "@/components/interviews/booking-status";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRupees } from "@/lib/commerce/pricing";
import { AUDIENCE_LABELS } from "@/lib/interviews/labels";
import { formatSlot } from "@/lib/time/zones";
import { requirePermission } from "@/server/auth";
import { interviewHub } from "@/server/services/interviews";

export const metadata: Metadata = { title: "Mock interviews" };

export default function InterviewsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Mock interviews"
        description="1:1 with engineers from top companies on Google Meet, with a written scorecard and topics to practise."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/become-interviewer">Become an interviewer</Link>
          </Button>
        }
      />
      <Suspense fallback={<PageSkeleton />}>
        <Hub />
      </Suspense>
    </div>
  );
}

async function Hub() {
  const user = await requirePermission("student.access");
  const hub = await interviewHub(user.id);

  return (
    <div className="space-y-10">
      {hub.held.length ? (
        <Card className="border-warning/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6 text-sm">
            <span>
              You have a slot on hold: {hub.held[0]!.type.name} on{" "}
              {formatSlot(hub.held[0]!.startsAt)}.
            </span>
            <Button asChild size="sm">
              <Link href={`/interviews/checkout/${hub.held[0]!.id}`}>Finish booking</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {hub.upcoming.length ? (
        <section className="space-y-3" aria-labelledby="upcoming">
          <h2 id="upcoming" className="text-lg font-semibold">
            Upcoming
          </h2>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {hub.upcoming.map((b) => (
              <li key={b.id}>
                <Card data-testid="upcoming-booking">
                  <CardContent className="space-y-3 pt-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{b.type.name}</p>
                      <BookingStatusBadge status={b.status} />
                    </div>
                    <p className="flex items-center gap-2 text-sm">
                      <Clock3 className="size-4 text-muted-foreground" aria-hidden="true" />{" "}
                      {formatSlot(b.startsAt)} IST · with {b.interviewer.user.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {b.meetUrl ? (
                        <Button asChild size="sm">
                          <a href={b.meetUrl} target="_blank" rel="noreferrer">
                            <Video /> Join
                          </a>
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          The meeting link is being created…
                        </span>
                      )}
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/interviews/${b.id}`}>Details</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3" aria-labelledby="types">
        <h2 id="types" className="text-lg font-semibold">
          Book an interview
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hub.types.map((t) => (
            <Card key={t.id} className="flex flex-col" data-testid="interview-type">
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{AUDIENCE_LABELS[t.audience]}</Badge>
                  {t.credits ? (
                    <Badge
                      variant="outline"
                      className="border-success/30 bg-success/10 text-success"
                    >
                      {t.credits} credit{t.credits === 1 ? "" : "s"}
                    </Badge>
                  ) : null}
                </div>
                <CardTitle>
                  <h3 className="text-base">{t.name}</h3>
                </CardTitle>
                <CardDescription>{t.description}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto flex items-center justify-between gap-3">
                <span className="text-sm">
                  <span className="font-semibold">{formatRupees(t.pricePaise)}</span>
                  <span className="text-muted-foreground"> · {t.durationMin} min</span>
                </span>
                <Button asChild size="sm">
                  <Link href={`/interviews/book/${t.slug}`}>
                    Choose interviewer <ArrowRight />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {hub.past.length ? (
        <section className="space-y-3" aria-labelledby="past">
          <h2 id="past" className="text-lg font-semibold">
            Past and cancelled
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {hub.past.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/interviews/${b.id}`}
                  className="flex min-w-0 flex-wrap items-center gap-3 px-4 py-3 hover:bg-secondary/40"
                >
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {b.type.name}{" "}
                    <span className="font-normal text-muted-foreground">
                      · {formatSlot(b.startsAt)}
                    </span>
                  </span>
                  <BookingStatusBadge status={b.status} />
                  <ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
