"use client";

import { submitDriveReportAction, type ReportState } from "@/app/(student)/asked/actions";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { ROUND_TYPE_LABELS } from "@/lib/content/companies";
import { DIFFICULTY_LABELS } from "@/lib/content/workflow";

const WHEN = [
  "Today",
  "Yesterday",
  "2 days ago",
  "3 days ago",
  "4 days ago",
  "5 days ago",
  "6 days ago",
  "A week ago",
];

export function DriveReportForm({
  companies,
  defaultCompany,
}: {
  companies: { id: string; name: string }[];
  defaultCompany?: string;
}) {
  const [state, onSubmit, pending] = useFormSubmit<ReportState>(submitDriveReportAction, {});
  const e = state.fieldErrors ?? {};
  if (state.done) {
    return (
      <Alert data-testid="drive-report-sent">
        <AlertDescription>
          Thank you! A moderator checks it, usually within a few hours, and then it&apos;s on the
          company page for everyone preparing.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Drive report">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="companyId" label="Company" error={e.companyId}>
          {(aria) => (
            <NativeSelect
              {...aria}
              name="companyId"
              className="w-full"
              defaultValue={defaultCompany ?? ""}
            >
              <NativeSelectOption value="" disabled>
                Choose a company
              </NativeSelectOption>
              {companies.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField id="daysAgo" label="When" error={e.daysAgo}>
          {(aria) => (
            <NativeSelect {...aria} name="daysAgo" className="w-full" defaultValue="0">
              {WHEN.map((label, days) => (
                <NativeSelectOption key={label} value={String(days)}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField id="roundType" label="Round" error={e.roundType}>
          {(aria) => (
            <NativeSelect {...aria} name="roundType" className="w-full" defaultValue="ONLINE_TEST">
              {Object.entries(ROUND_TYPE_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField id="difficulty" label="How hard was it?" error={e.difficulty}>
          {(aria) => (
            <NativeSelect {...aria} name="difficulty" className="w-full" defaultValue="MEDIUM">
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
      <FormField
        id="questions"
        label="What was asked?"
        error={e.questions}
        description="The questions you remember, in your own words. One per line is fine."
      >
        {(aria) => <Textarea {...aria} name="questions" rows={6} />}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="topics" label="Sections or topics (optional)" error={e.topics}>
          {(aria) => <Input {...aria} name="topics" placeholder="Quant, reasoning, 2 coding" />}
        </FormField>
        <FormField id="platform" label="Platform (optional)" error={e.platform}>
          {(aria) => <Input {...aria} name="platform" placeholder="TCS iON, HackerRank…" />}
        </FormField>
        <FormField id="location" label="City or online (optional)" error={e.location}>
          {(aria) => <Input {...aria} name="location" placeholder="Pune" />}
        </FormField>
      </div>
      <p className="text-xs text-muted-foreground">
        Don&apos;t paste screenshots or exact copies of test content; describe questions instead.
        Your name is never shown.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send report"}
      </Button>
    </form>
  );
}
