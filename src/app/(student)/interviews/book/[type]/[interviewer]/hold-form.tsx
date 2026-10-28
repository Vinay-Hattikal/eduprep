"use client";

import { useActionState } from "react";
import { holdAction, type FormState } from "@/app/(student)/interviews/actions";
import { SlotPicker } from "@/components/interviews/slot-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

export function HoldForm({
  interviewerId,
  typeSlug,
  slots,
  companies,
}: {
  interviewerId: string;
  typeSlug: string;
  slots: string[];
  companies: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(holdAction, {});
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="interviewerId" value={interviewerId} />
      <input type="hidden" name="typeSlug" value={typeSlug} />
      <SlotPicker slots={slots} />
      {companies.length ? (
        <div className="space-y-1.5">
          <Label htmlFor="companyId">Preparing for a company? (optional)</Label>
          <NativeSelect id="companyId" name="companyId" className="w-full sm:w-80" defaultValue="">
            <NativeSelectOption value="">No specific company</NativeSelectOption>
            {companies.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="notes">What should the interviewer focus on? (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          maxLength={1000}
          placeholder="e.g. Graphs and DP; I freeze when explaining my approach."
        />
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending || !slots.length} data-testid="hold-slot">
        {pending ? "Holding the slot…" : "Continue"}
      </Button>
      <p className="text-xs text-muted-foreground">
        We hold the slot for a few minutes while you confirm.
      </p>
    </form>
  );
}
