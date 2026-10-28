import type { Metadata } from "next";
import { Suspense } from "react";
import { CircleAlert, Search } from "lucide-react";
import { adminCancelAction, interviewerNoShowAction } from "@/app/admin/interviews/actions";
import { BookingStatusBadge } from "@/components/interviews/booking-status";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { BookingStatus } from "@/generated/prisma/enums";
import { BOOKING_STATUS_LABELS } from "@/lib/interviews/labels";
import { formatSlot } from "@/lib/time/zones";
import { requirePermission } from "@/server/auth";
import { listBookingsForAdmin } from "@/server/services/interviews";

export const metadata: Metadata = { title: "Interview bookings" };

const STATUSES = Object.keys(BOOKING_STATUS_LABELS) as BookingStatus[];

export default function AdminInterviewsPage({ searchParams }: PageProps<"/admin/interviews">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Interview bookings"
        description="All bookings. Cancel with a refund to credit, or record an interviewer no-show (credit back, penalty)."
      />
      <Suspense fallback={<TableSkeleton rows={8} />}>
        <Bookings searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Bookings({
  searchParams,
}: {
  searchParams: PageProps<"/admin/interviews">["searchParams"];
}) {
  await requirePermission("interviews.manage");
  const query = await searchParams;
  const status = STATUSES.find((s) => s === query.status);
  const q = typeof query.q === "string" ? query.q.slice(0, 80) || undefined : undefined;
  const bookings = await listBookingsForAdmin({ status, q });
  const now = new Date();

  return (
    <div className="space-y-4">
      {typeof query.error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      ) : null}
      <form className="flex flex-wrap gap-2" role="search" aria-label="Filter bookings">
        <div className="relative min-w-48 flex-1">
          <Search
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Candidate or interviewer"
            aria-label="Search"
            className="pl-8"
          />
        </div>
        <NativeSelect name="status" defaultValue={status ?? ""} aria-label="Status">
          <NativeSelectOption value="">Active and past</NativeSelectOption>
          {STATUSES.map((s) => (
            <NativeSelectOption key={s} value={s}>
              {BOOKING_STATUS_LABELS[s]}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>
      {bookings.length === 0 ? (
        <EmptyState title="No bookings" />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {bookings.map((b) => (
            <li key={b.id} className="space-y-2 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{b.candidate.name}</span>
                <span className="text-muted-foreground">with {b.interviewer.user.name}</span>
                <span className="text-muted-foreground">· {b.type.name}</span>
                <span className="tabular-nums">· {formatSlot(b.startsAt)} IST</span>
                <BookingStatusBadge status={b.status} />
                {b.rating ? (
                  <span className="text-xs text-muted-foreground">rated {b.rating.stars}/5</span>
                ) : null}
              </div>
              {b.status === "CONFIRMED" || b.status === "NO_SHOW_CANDIDATE" ? (
                <div className="flex flex-wrap gap-2">
                  {b.status === "CONFIRMED" ? (
                    <form action={adminCancelAction} className="flex gap-2">
                      <input type="hidden" name="bookingId" value={b.id} />
                      <Input
                        name="reason"
                        placeholder="Reason"
                        className="h-8 w-48"
                        maxLength={200}
                      />
                      <Button type="submit" size="sm" variant="outline">
                        Cancel, return credit
                      </Button>
                    </form>
                  ) : null}
                  {b.startsAt < now ? (
                    <form action={interviewerNoShowAction}>
                      <input type="hidden" name="bookingId" value={b.id} />
                      <Button type="submit" size="sm" variant="destructive">
                        Interviewer no-show
                      </Button>
                    </form>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
