"use client";

import {
  addSourceAction,
  saveRoundAction,
  saveSectionAction,
  type HiringFormState,
} from "@/app/admin/companies/hiring-actions";
import { FormField } from "@/components/shared/form-field";
import { TopicPicker, type TopicOptions } from "@/components/shared/topic-picker";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { ROUND_TYPE_LABELS } from "@/lib/content/companies";

function FormError({ message }: { message?: string }) {
  return message ? (
    <Alert variant="destructive">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null;
}

export type RoundValues = {
  id?: string;
  name: string;
  type: string;
  platform: string | null;
  durationMin: number | null;
  isElimination: boolean | null;
  description: string | null;
};

/** Adds a round at the end (no id) or edits one. */
export function RoundForm({
  companyId,
  platforms,
  values,
}: {
  companyId: string;
  platforms: readonly string[];
  values?: RoundValues;
}) {
  const [state, onSubmit, pending] = useFormSubmit<HiringFormState>(saveRoundAction, {});
  const errors = state.fieldErrors ?? {};
  const p = values?.id ? `round-${values.id}` : "round-new";
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3"
      aria-label={values?.id ? "Edit round" : "New round"}
    >
      <input type="hidden" name="companyId" value={companyId} />
      {values?.id ? <input type="hidden" name="roundId" value={values.id} /> : null}
      <FormError message={state.formError} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${p}-name`} label="Round name" error={errors.name}>
          {(aria) => (
            <Input
              {...aria}
              name="name"
              defaultValue={values?.name}
              placeholder="Online assessment"
            />
          )}
        </FormField>
        <FormField id={`${p}-type`} label="Round type" error={errors.type}>
          {(aria) => (
            <NativeSelect
              {...aria}
              name="type"
              defaultValue={values?.type ?? "ONLINE_TEST"}
              className="w-full"
            >
              {Object.entries(ROUND_TYPE_LABELS).map(([value, label]) => (
                <NativeSelectOption key={value} value={value}>
                  {label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField id={`${p}-platform`} label="Platform (optional)" error={errors.platform}>
          {(aria) => (
            <NativeSelect
              {...aria}
              name="platform"
              defaultValue={values?.platform ?? ""}
              className="w-full"
            >
              <NativeSelectOption value="">None</NativeSelectOption>
              {platforms.map((platform) => (
                <NativeSelectOption key={platform} value={platform}>
                  {platform}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField id={`${p}-duration`} label="Length (minutes)" error={errors.durationMin}>
          {(aria) => (
            <Input
              {...aria}
              name="durationMin"
              inputMode="numeric"
              defaultValue={values?.durationMin ?? ""}
            />
          )}
        </FormField>
        <FormField id={`${p}-elimination`} label="Elimination round?" error={errors.isElimination}>
          {(aria) => (
            <NativeSelect
              {...aria}
              name="isElimination"
              defaultValue={
                values?.isElimination === null || values?.isElimination === undefined
                  ? ""
                  : values.isElimination
                    ? "yes"
                    : "no"
              }
              className="w-full"
            >
              <NativeSelectOption value="">Not known</NativeSelectOption>
              <NativeSelectOption value="yes">Yes</NativeSelectOption>
              <NativeSelectOption value="no">No</NativeSelectOption>
            </NativeSelect>
          )}
        </FormField>
      </div>
      <FormField id={`${p}-description`} label="Description (optional)" error={errors.description}>
        {(aria) => (
          <Textarea
            {...aria}
            name="description"
            rows={2}
            defaultValue={values?.description ?? ""}
          />
        )}
      </FormField>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : values?.id ? "Save round" : "Add round"}
      </Button>
    </form>
  );
}

export type SectionValues = {
  id?: string;
  name: string;
  type: string;
  questionCount: number;
  minutes: number;
  negativeMarks: number;
  canGoBack: boolean;
  topicIds: string[];
};

/** Adds a test section to a round (no id) or edits one. */
export function SectionForm({
  roundId,
  topics,
  values,
}: {
  roundId: string;
  topics: TopicOptions;
  values?: SectionValues;
}) {
  const [state, onSubmit, pending] = useFormSubmit<HiringFormState>(saveSectionAction, {});
  const errors = state.fieldErrors ?? {};
  const p = values?.id ? `section-${values.id}` : `section-new-${roundId}`;
  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3"
      aria-label={values?.id ? "Edit section" : "New section"}
    >
      <input type="hidden" name="roundId" value={roundId} />
      {values?.id ? <input type="hidden" name="sectionId" value={values.id} /> : null}
      <FormError message={state.formError} />
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField id={`${p}-name`} label="Section name" error={errors.name}>
          {(aria) => (
            <Input
              {...aria}
              name="name"
              defaultValue={values?.name}
              placeholder="Numerical ability"
            />
          )}
        </FormField>
        <FormField id={`${p}-type`} label="Section type" error={errors.type}>
          {(aria) => (
            <NativeSelect
              {...aria}
              name="type"
              defaultValue={values?.type ?? "MCQ"}
              className="w-full"
            >
              <NativeSelectOption value="MCQ">Multiple choice</NativeSelectOption>
              <NativeSelectOption value="CODING">Coding</NativeSelectOption>
            </NativeSelect>
          )}
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FormField id={`${p}-count`} label="Questions" error={errors.questionCount}>
          {(aria) => (
            <Input
              {...aria}
              name="questionCount"
              inputMode="numeric"
              defaultValue={values?.questionCount ?? ""}
            />
          )}
        </FormField>
        <FormField id={`${p}-minutes`} label="Minutes" error={errors.minutes}>
          {(aria) => (
            <Input
              {...aria}
              name="minutes"
              inputMode="numeric"
              defaultValue={values?.minutes ?? ""}
            />
          )}
        </FormField>
        <FormField
          id={`${p}-negative`}
          label="Negative marks"
          error={errors.negativeMarks}
          description="Per wrong answer, e.g. 0.25"
        >
          {(aria) => (
            <Input
              {...aria}
              name="negativeMarks"
              inputMode="decimal"
              defaultValue={values?.negativeMarks ?? 0}
            />
          )}
        </FormField>
        <div className="flex items-center gap-2 self-center pt-5">
          <Checkbox id={`${p}-back`} name="canGoBack" defaultChecked={values?.canGoBack ?? true} />
          <Label htmlFor={`${p}-back`} className="font-normal">
            Can go back
          </Label>
        </div>
      </div>
      <TopicPicker
        id={`${p}-topics`}
        subjects={topics}
        defaultValues={values?.topicIds ?? []}
        error={errors.topicIds}
        legend="Topics this section tests"
      />
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Saving…" : values?.id ? "Save section" : "Add section"}
      </Button>
    </form>
  );
}

/** Adds a source link to the company. */
export function SourceForm({ companyId, today }: { companyId: string; today: string }) {
  const [state, onSubmit, pending] = useFormSubmit<HiringFormState>(addSourceAction, {});
  const errors = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="New source">
      <input type="hidden" name="companyId" value={companyId} />
      <FormError message={state.formError} />
      <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
        <FormField id="source-label" label="Label" error={errors.label}>
          {(aria) => <Input {...aria} name="label" placeholder="Official careers page" />}
        </FormField>
        <FormField id="source-url" label="Link" error={errors.url}>
          {(aria) => <Input {...aria} name="url" type="url" placeholder="https://" />}
        </FormField>
        <FormField id="source-checked" label="Checked on" error={errors.checkedOn}>
          {(aria) => <Input {...aria} name="checkedOn" type="date" defaultValue={today} />}
        </FormField>
      </div>
      <Button type="submit" size="sm" disabled={pending}>
        {pending ? "Adding…" : "Add source"}
      </Button>
    </form>
  );
}
