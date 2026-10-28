import { Badge } from "@/components/ui/badge";
import type { BookingStatus } from "@/generated/prisma/enums";
import { BOOKING_STATUS_LABELS, BOOKING_STATUS_TONES } from "@/lib/interviews/labels";

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return (
    <Badge variant="outline" className={BOOKING_STATUS_TONES[status]}>
      {BOOKING_STATUS_LABELS[status]}
    </Badge>
  );
}
