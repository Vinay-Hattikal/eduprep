"use client";

import { Flag } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { reportErrorAction } from "@/app/(student)/practice/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

const REASONS = {
  WRONG_ANSWER: "The answer is wrong",
  WRONG_EXPLANATION: "The explanation is wrong",
  TYPO: "Typo or formatting problem",
  UNCLEAR: "The question is unclear",
  OTHER: "Something else",
} as const;

/** "Report an error" on every question (PRD 4.4). */
export function ReportDialog({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), setError(null))}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Flag /> Report
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            startTransition(async () => {
              const result = await reportErrorAction({
                questionId,
                reason: String(data.get("reason")) as keyof typeof REASONS,
                message: String(data.get("message") ?? ""),
              });
              if (result.ok) {
                setOpen(false);
                toast.success("Thanks! We'll check it and reply on your dashboard.");
              } else setError(result.error);
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Report a problem</DialogTitle>
            <DialogDescription>
              Every report is checked by a reviewer. We&apos;ll reply on your dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="report-reason">What&apos;s wrong?</Label>
            <NativeSelect
              id="report-reason"
              name="reason"
              defaultValue="WRONG_ANSWER"
              className="w-full"
            >
              {Object.entries(REASONS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="report-message">Details</Label>
            <Textarea
              id="report-message"
              name="message"
              rows={4}
              required
              minLength={5}
              maxLength={1000}
              placeholder="e.g. Option B should be 4% decrease because…"
            />
            {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
