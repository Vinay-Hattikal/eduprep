import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookingStatusBadge } from "@/components/interviews/booking-status";
import { DataTable } from "@/components/shared/data-table";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { formatSlot } from "@/lib/time/zones";
import { requirePermission } from "@/server/auth";
import { listInterviewerBookings } from "@/server/services/interviews";

export const metadata: Metadata = { title: "Interviews" };

export default function InterviewerBookingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Interviews"
        description="Everything booked with you. Open one to see the candidate and write the scorecard."
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Bookings />
      </Suspense>
    </div>
  );
}

async function Bookings() {
  const user = await requirePermission("interviewer.access");
  const bookings = await listInterviewerBookings(user.id);
  return (
    <DataTable
      caption="Interviews"
      rows={bookings}
      rowKey={(b) => b.id}
      emptyTitle="No interviews yet"
      columns={[
        {
          key: "candidate",
          header: "Candidate",
          cell: (b) => (
            <Link
              href={`/interviewer/bookings/${b.id}`}
              className="font-medium text-primary hover:underline"
            >
              {b.candidate.name}
            </Link>
          ),
        },
        { key: "type", header: "Type", hideOnMobile: true, cell: (b) => b.type.name },
        {
          key: "when",
          header: "When",
          cell: (b) => formatSlot(b.startsAt, b.interviewer.timeZone),
        },
        { key: "status", header: "Status", cell: (b) => <BookingStatusBadge status={b.status} /> },
      ]}
    />
  );
}
