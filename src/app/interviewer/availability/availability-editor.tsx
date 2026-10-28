"use client";

import { Plus, Trash2 } from "lucide-react";
import { useActionState, useState } from "react";
import { saveAvailabilityAction, type FormState } from "@/app/interviewer/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const ZONES = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "Australia/Sydney",
];

type Rule = { weekday: number; startMinute: number; endMinute: number };

const toTime = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const toMinute = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Weekly hours per day; saved as one list. */
export function AvailabilityEditor({
  initial,
}: {
  initial: { timeZone: string; bufferMin: number; rules: Rule[] };
}) {
  const [rules, setRules] = useState<Rule[]>(initial.rules);
  const [state, action, pending] = useActionState<FormState, FormData>(saveAvailabilityAction, {});
  const update = (index: number, patch: Partial<Rule>) =>
    setRules((r) => r.map((x, i) => (i === index ? { ...x, ...patch } : x)));
  const zones = ZONES.includes(initial.timeZone) ? ZONES : [initial.timeZone, ...ZONES];

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="rules" value={JSON.stringify(rules)} />
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="timeZone">Your time zone</Label>
          <NativeSelect id="timeZone" name="timeZone" defaultValue={initial.timeZone}>
            {zones.map((z) => (
              <NativeSelectOption key={z} value={z}>
                {z}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="bufferMin">Break between interviews (minutes)</Label>
          <Input
            id="bufferMin"
            name="bufferMin"
            type="number"
            min={0}
            max={120}
            step={5}
            defaultValue={initial.bufferMin}
            className="w-28"
          />
        </div>
      </div>

      <div className="space-y-4">
        {DAYS.map((day, weekday) => {
          const dayRules = rules
            .map((r, index) => ({ r, index }))
            .filter(({ r }) => r.weekday === weekday);
          return (
            <div key={day} className="flex flex-col gap-2 border-b pb-4 sm:flex-row sm:items-start">
              <p className="w-28 shrink-0 pt-1.5 text-sm font-medium">{day}</p>
              <div className="flex-1 space-y-2">
                {dayRules.length === 0 ? (
                  <p className="pt-1.5 text-sm text-muted-foreground">Not available</p>
                ) : null}
                {dayRules.map(({ r, index }) => (
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <Input
                      type="time"
                      step={1800}
                      aria-label={`${day} from`}
                      value={toTime(r.startMinute)}
                      onChange={(e) => update(index, { startMinute: toMinute(e.target.value) })}
                      className="w-32"
                    />
                    <span className="text-sm text-muted-foreground">to</span>
                    <Input
                      type="time"
                      step={1800}
                      aria-label={`${day} until`}
                      value={toTime(r.endMinute)}
                      onChange={(e) => update(index, { endMinute: toMinute(e.target.value) })}
                      className="w-32"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${day} block`}
                      onClick={() => setRules((x) => x.filter((_, i) => i !== index))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setRules((x) => [...x, { weekday, startMinute: 18 * 60, endMinute: 21 * 60 }])
                }
              >
                <Plus /> Add hours
              </Button>
            </div>
          );
        })}
      </div>

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : state.saved ? (
        <Alert>
          <AlertDescription>Saved. Candidates see your new free slots now.</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={pending} data-testid="save-availability">
        {pending ? "Saving…" : "Save weekly hours"}
      </Button>
    </form>
  );
}
