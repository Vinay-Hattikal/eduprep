"use client";

import { saveTrackAction, type TrackFormState } from "@/app/admin/tracks/actions";
import { CheckboxGroup } from "@/components/shared/checkbox-group";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";

export type TrackFormValues = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  roadmap: string;
  audience: string;
  order: number;
  topicIds: string[];
  interviewTypes: string[];
};

type Options = {
  subjects: { name: string; topics: { id: string; name: string }[] }[];
  interviewTypes: { slug: string; name: string }[];
};

/** Creates (no id) or edits a role track. */
export function TrackForm({
  values,
  options,
  canEdit,
}: {
  values: TrackFormValues;
  options: Options;
  canEdit: boolean;
}) {
  const [state, onSubmit, pending] = useFormSubmit<TrackFormState>(saveTrackAction, {});
  const errors = state.fieldErrors ?? {};
  const creating = !values.id;

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Role track">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={!canEdit || pending} className="min-w-0 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="track-name" label="Name" error={errors.name}>
            {(aria) => <Input {...aria} name="name" defaultValue={values.name} />}
          </FormField>
          <FormField
            id="track-slug"
            label="URL slug"
            error={errors.slug}
            description={
              creating
                ? "Used in the address: /tracks/your-slug. It can't be changed later."
                : undefined
            }
          >
            {(aria) => (
              <Input
                {...aria}
                name="slug"
                defaultValue={values.slug}
                readOnly={!creating}
                className="font-mono"
              />
            )}
          </FormField>
        </div>
        <FormField id="track-description" label="Short description" error={errors.description}>
          {(aria) => (
            <Textarea {...aria} name="description" rows={2} defaultValue={values.description} />
          )}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="track-audience" label="For" error={errors.audience}>
            {(aria) => (
              <NativeSelect
                {...aria}
                name="audience"
                defaultValue={values.audience}
                className="w-full"
              >
                <NativeSelectOption value="EXPERIENCED">Experienced candidates</NativeSelectOption>
                <NativeSelectOption value="FRESHER">Freshers</NativeSelectOption>
                <NativeSelectOption value="BOTH">Both</NativeSelectOption>
              </NativeSelect>
            )}
          </FormField>
          <FormField
            id="track-order"
            label="Order"
            error={errors.order}
            description="Lower numbers are listed first."
          >
            {(aria) => (
              <Input {...aria} name="order" inputMode="numeric" defaultValue={values.order} />
            )}
          </FormField>
        </div>
        <FormField
          id="track-roadmap"
          label="Roadmap (Markdown)"
          error={errors.roadmap}
          description="Week-by-week plan or steps the candidate should follow."
        >
          {(aria) => (
            <Textarea
              {...aria}
              name="roadmap"
              rows={10}
              defaultValue={values.roadmap}
              className="font-mono text-sm"
            />
          )}
        </FormField>
        <div className="space-y-4 rounded-lg border p-4">
          <p className="text-sm font-medium">Topics</p>
          {errors.topicIds ? (
            <p className="text-xs font-medium text-destructive">{errors.topicIds}</p>
          ) : null}
          {options.subjects.map((subject, i) => (
            <CheckboxGroup
              key={subject.name}
              id={`track-topics-${i}`}
              name="topicIds"
              legend={subject.name}
              options={subject.topics.map((t) => ({ value: t.id, label: t.name }))}
              defaultValues={values.topicIds}
            />
          ))}
        </div>
        <CheckboxGroup
          id="track-interview-types"
          name="interviewTypes"
          legend="Interview types to suggest"
          options={options.interviewTypes.map((t) => ({ value: t.slug, label: t.name }))}
          defaultValues={values.interviewTypes}
          error={errors.interviewTypes}
        />
        <p className="text-xs text-muted-foreground">
          {creating
            ? "New tracks are shown to students straight away. Hide one from the track list."
            : "Changes are shown to students straight away."}
        </p>
        {canEdit ? (
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : creating ? "Create track" : "Save changes"}
          </Button>
        ) : null}
      </fieldset>
    </form>
  );
}
