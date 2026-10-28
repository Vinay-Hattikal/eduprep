"use client";

import { PlayCircle } from "lucide-react";
import { useActionState, useState } from "react";
import { startTestAction, type StartState } from "@/app/(student)/tests/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function StartTestForm({ slug }: { slug: string }) {
  const [state, action, pending] = useActionState<StartState, FormData>(startTestAction, {});
  const [ready, setReady] = useState(false);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="slug" value={slug} />
      <div className="flex items-start gap-2">
        <Checkbox
          id="ready"
          checked={ready}
          onCheckedChange={(v) => setReady(v === true)}
          className="mt-0.5"
        />
        <Label htmlFor="ready" className="text-sm leading-snug font-normal">
          I&apos;ve read the instructions. The timer starts as soon as I begin and keeps running if
          I leave.
        </Label>
      </div>
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" size="lg" disabled={!ready || pending} data-testid="start-test">
        <PlayCircle /> {pending ? "Preparing your test…" : "Begin test"}
      </Button>
    </form>
  );
}
