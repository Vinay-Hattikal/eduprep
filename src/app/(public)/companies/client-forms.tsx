"use client";

import { Check, Plus } from "lucide-react";
import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  addTargetAction,
  requestCompanyAction,
  type RequestState,
} from "@/app/(public)/companies/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RequestCompanyForm() {
  const [state, action, pending] = useActionState(requestCompanyAction, {} as RequestState);
  return (
    <form action={action} className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="companyName"
          placeholder="Company name"
          aria-label="Company name"
          required
          maxLength={100}
        />
        <Button type="submit" variant="outline" disabled={pending} className="shrink-0">
          {pending ? "Sending…" : "Request it"}
        </Button>
      </div>
      {state.ok ? (
        <p className="text-sm text-success">
          Thanks! The most-requested companies are added first.
        </p>
      ) : null}
      {state.error ? <p className="text-sm text-destructive">{state.error}</p> : null}
    </form>
  );
}

export function AddTargetButton({ companyId, added }: { companyId: string; added: boolean }) {
  const [isAdded, setAdded] = useState(added);
  const [pending, startTransition] = useTransition();
  if (isAdded) {
    return (
      <Button variant="secondary" disabled>
        <Check /> In your targets
      </Button>
    );
  }
  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await addTargetAction(companyId);
          if (result.ok) {
            setAdded(true);
            toast.success("Added to your target companies");
          } else toast.error(result.error);
        })
      }
    >
      <Plus /> Prepare for this company
    </Button>
  );
}
