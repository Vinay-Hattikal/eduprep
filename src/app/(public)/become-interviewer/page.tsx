import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { CalendarClock, ClipboardCheck, Wallet } from "lucide-react";
import { ApplyForm } from "@/app/(public)/become-interviewer/apply-form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { getSetting } from "@/server/services/settings";

export const metadata: Metadata = {
  title: "Become an interviewer",
  description: `Take 1:1 mock interviews for students and engineers on ${siteConfig.name}, on your own schedule, and get paid.`,
  alternates: { canonical: "/become-interviewer" },
};

export default function BecomeInterviewerPage() {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-10 px-4 py-12 sm:px-6">
      <div className="space-y-3">
        <h1 className="text-[2rem] leading-[1.1] font-bold tracking-[-0.025em] text-balance sm:text-[2.5rem]">
          Interview with us
        </h1>
        <p className="text-pretty text-muted-foreground">
          Help freshers and engineers get ready for real interviews. You set the hours; we handle
          bookings, payments and reminders.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-xl" />}>
        <Application />
      </Suspense>
    </main>
  );
}

async function Application() {
  const [user, share] = await Promise.all([
    getCurrentUser(),
    getSetting("payouts.interviewerSharePercent"),
  ]);
  const perks = [
    {
      icon: CalendarClock,
      title: "Your schedule",
      text: "Set weekly hours and days off. Candidates book free slots only.",
    },
    {
      icon: ClipboardCheck,
      title: "Simple scorecards",
      text: "A short rubric per interview type, filled in after the call.",
    },
    {
      icon: Wallet,
      title: `${share}% of the price`,
      text: "Earnings are released when you submit the scorecard.",
    },
  ];
  const application = user
    ? await db.interviewer.findUnique({
        where: { userId: user.id },
        select: { status: true, reviewNote: true },
      })
    : null;
  const types = await db.interviewType.findMany({
    where: { active: true },
    orderBy: { order: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-8">
      <ul className="grid gap-4 sm:grid-cols-3">
        {perks.map((p) => (
          <li key={p.title} className="space-y-1">
            <p.icon className="size-6 text-primary" aria-hidden="true" />
            <p className="font-medium">{p.title}</p>
            <p className="text-sm text-muted-foreground">{p.text}</p>
          </li>
        ))}
      </ul>

      {!user ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
            <p className="text-sm">Sign in to apply.</p>
            <Button asChild>
              <Link href="/sign-in?next=/become-interviewer">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      ) : application && application.status !== "REJECTED" ? (
        <Alert>
          <AlertTitle>
            {application.status === "APPLIED"
              ? "Application received"
              : application.status === "APPROVED"
                ? "You're an interviewer"
                : "Your interviewer account is paused"}
          </AlertTitle>
          <AlertDescription>
            {application.status === "APPLIED" ? (
              "We'll email you once it's reviewed."
            ) : application.status === "APPROVED" ? (
              <Link href="/interviewer" className="underline">
                Open the interviewer portal
              </Link>
            ) : (
              (application.reviewNote ?? "Contact support for details.")
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Apply</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {application?.status === "REJECTED" && application.reviewNote ? (
              <p className="mb-4 text-sm text-muted-foreground">
                Last time: {application.reviewNote}
              </p>
            ) : null}
            <ApplyForm types={types} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
