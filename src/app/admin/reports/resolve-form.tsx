"use client";

import { useActionState } from "react";
import { resolveReportAction, type ResolveState } from "@/app/admin/reports/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ResolveForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(resolveReportAction, {} as ResolveState);
  if (state.ok)
    return <p className="text-sm text-success">Closed. The student will see your reply.</p>;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <Label htmlFor={`reply-${id}`} className="text-xs">
        Reply to the student
      </Label>
      <Textarea
        id={`reply-${id}`}
        name="reply"
        rows={2}
        required
        minLength={5}
        maxLength={1000}
        placeholder="e.g. Thanks, you're right: option B is now corrected."
      />
      {state.error ? <p className="text-xs font-medium text-destructive">{state.error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="status" value="FIXED" size="sm" disabled={pending}>
          Fixed
        </Button>
        <Button
          type="submit"
          name="status"
          value="REJECTED"
          size="sm"
          variant="outline"
          disabled={pending}
        >
          No change needed
        </Button>
      </div>
    </form>
  );
}
