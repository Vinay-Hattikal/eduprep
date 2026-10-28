import type { Metadata } from "next";
import { Suspense } from "react";
import { Trash2 } from "lucide-react";
import { addBlockAction, removeBlockAction } from "@/app/interviewer/actions";
import { AvailabilityEditor } from "@/app/interviewer/availability/availability-editor";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requirePermission } from "@/server/auth";
import { getInterviewerProfile } from "@/server/services/interviews";

export const metadata: Metadata = { title: "Availability" };

export default function AvailabilityPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Availability"
        description="Your weekly hours and days off. Candidates can book any free slot that fits."
      />
      <Suspense fallback={<PageSkeleton />}>
        <Availability />
      </Suspense>
    </div>
  );
}

async function Availability() {
  const user = await requirePermission("interviewer.access");
  const profile = await getInterviewerProfile(user.id);
  if (!profile)
    return <p className="text-sm text-muted-foreground">Apply as an interviewer first.</p>;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Weekly hours</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AvailabilityEditor
            initial={{
              timeZone: profile.timeZone,
              bufferMin: profile.bufferMin,
              rules: profile.rules.map(({ weekday, startMinute, endMinute }) => ({
                weekday,
                startMinute,
                endMinute,
              })),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Days off</h2>
          </CardTitle>
          <CardDescription>
            No slots are offered on these dates. Existing bookings stay.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={addBlockAction} className="flex flex-wrap items-end gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" required />
            </div>
            <div className="min-w-48 flex-1 space-y-1.5">
              <Label htmlFor="note">Note (optional)</Label>
              <Input id="note" name="note" maxLength={120} />
            </div>
            <Button type="submit" variant="secondary">
              Add day off
            </Button>
          </form>
          {profile.blocks.length ? (
            <ul className="divide-y rounded-lg border">
              {profile.blocks.map((b) => (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
                >
                  <span>
                    {b.date.toISOString().slice(0, 10)}
                    {b.note ? <span className="text-muted-foreground"> · {b.note}</span> : null}
                  </span>
                  <form action={removeBlockAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <Button type="submit" variant="ghost" size="icon" aria-label="Remove day off">
                      <Trash2 />
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
