"use client";

import { useState } from "react";
import { transitionQuestionAction } from "@/app/admin/questions/actions";
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
import { Textarea } from "@/components/ui/textarea";
import { ACTION_LABELS, type QuestionAction } from "@/lib/content/workflow";

const VARIANTS: Record<QuestionAction, "default" | "outline" | "destructive" | "secondary"> = {
  submit: "default",
  approve: "default",
  reject: "outline",
  archive: "destructive",
  restore: "outline",
};

/** Workflow buttons for one question. Sending back asks for a note to the author. */
export function WorkflowActions({ id, actions }: { id: string; actions: QuestionAction[] }) {
  const [open, setOpen] = useState(false);
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) =>
        action === "reject" ? (
          <Dialog key={action} open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant={VARIANTS[action]}>{ACTION_LABELS[action]}</Button>
            </DialogTrigger>
            <DialogContent>
              <form action={transitionQuestionAction} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Send back to draft</DialogTitle>
                  <DialogDescription>
                    Tell the author what to fix. They see this note on the question.
                  </DialogDescription>
                </DialogHeader>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="action" value="reject" />
                <div className="space-y-1.5">
                  <Label htmlFor="review-note">What needs to change?</Label>
                  <Textarea id="review-note" name="note" rows={4} required />
                </div>
                <DialogFooter>
                  <Button type="submit">Send back</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : (
          <form key={action} action={transitionQuestionAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="action" value={action} />
            <Button type="submit" variant={VARIANTS[action]} data-testid={`question-${action}`}>
              {ACTION_LABELS[action]}
            </Button>
          </form>
        ),
      )}
    </div>
  );
}
