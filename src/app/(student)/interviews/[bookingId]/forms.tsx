"use client";

import { Star } from "lucide-react";
import { useActionState, useState } from "react";
import { rateAction, rescheduleAction, type FormState } from "@/app/(student)/interviews/actions";
import { SlotPicker } from "@/components/interviews/slot-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function RescheduleForm({ bookingId, slots }: { bookingId: string; slots: string[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(rescheduleAction, {});
  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        data-testid="open-reschedule"
      >
        Move to another time
      </Button>
    );
  }
  return (
    <form action={action} className="w-full space-y-3 rounded-lg border p-4">
      <input type="hidden" name="bookingId" value={bookingId} />
      <SlotPicker slots={slots} />
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Moving…" : "Move booking"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Keep current time
        </Button>
      </div>
    </form>
  );
}

export function RateForm({ bookingId }: { bookingId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(rateAction, {});
  const [stars, setStars] = useState(0);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="stars" value={stars} />
      <fieldset>
        <legend className="mb-1 text-sm font-medium">How helpful was this interview?</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setStars(n)}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              aria-pressed={stars === n}
              className="rounded-md p-1 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Star
                className={cn(
                  "size-7",
                  n <= stars ? "fill-warning text-warning" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <Label htmlFor="comment">
          Anything to add? (optional, shared with the team, not the interviewer)
        </Label>
        <Textarea id="comment" name="comment" rows={2} maxLength={1000} />
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={!stars || pending} data-testid="submit-rating">
        Send rating
      </Button>
    </form>
  );
}
