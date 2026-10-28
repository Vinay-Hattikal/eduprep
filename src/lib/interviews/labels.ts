import type { BookingStatus } from "@/generated/prisma/enums";

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  HELD: "Waiting for payment",
  CONFIRMED: "Confirmed",
  COMPLETED: "Scorecard ready",
  CANCELLED: "Cancelled",
  EXPIRED: "Hold expired",
  NO_SHOW_CANDIDATE: "Missed",
  NO_SHOW_INTERVIEWER: "Interviewer absent: credit returned",
};

export const BOOKING_STATUS_TONES: Record<BookingStatus, string> = {
  HELD: "border-warning/30 bg-warning/10 text-warning",
  CONFIRMED: "border-info/30 bg-info/10 text-info",
  COMPLETED: "border-success/30 bg-success/10 text-success",
  CANCELLED: "border-border bg-muted text-muted-foreground",
  EXPIRED: "border-border bg-muted text-muted-foreground",
  NO_SHOW_CANDIDATE: "border-destructive/30 bg-destructive/10 text-destructive",
  NO_SHOW_INTERVIEWER: "border-border bg-muted text-muted-foreground",
};

export const AUDIENCE_LABELS = {
  FRESHER: "Freshers",
  EXPERIENCED: "Experienced",
  BOTH: "Freshers and experienced",
} as const;
