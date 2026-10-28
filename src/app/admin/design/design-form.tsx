"use client";

import { saveDesignAction, type DesignFormState } from "@/app/admin/design/actions";
import { CheckboxGroup } from "@/components/shared/checkbox-group";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";

export type DesignFormValues = {
  id?: string;
  externalId: string;
  slug: string;
  kind: string;
  title: string;
  difficulty: string;
  prompt: string;
  requirements: string;
  approach: string;
  tradeoffs: string;
  followUps: string;
  companies: string[];
  tracks: string[];
};

type TextName = "prompt" | "requirements" | "approach" | "tradeoffs" | "followUps";

/** Creates (no id) or edits a system design / low-level design question. */
export function DesignForm({
  values,
  tracks,
  canEdit,
}: {
  values: DesignFormValues;
  tracks: { slug: string; name: string }[];
  canEdit: boolean;
}) {
  const [state, onSubmit, pending] = useFormSubmit<DesignFormState>(saveDesignAction, {});
  const errors = state.fieldErrors ?? {};
  const creating = !values.id;
  const text = (name: TextName, label: string, rows: number, description?: string) => (
    <FormField id={`design-${name}`} label={label} error={errors[name]} description={description}>
      {(aria) => <Textarea {...aria} name={name} rows={rows} defaultValue={values[name]} />}
    </FormField>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Design question">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={!canEdit || pending} className="min-w-0 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="design-externalId"
            label="ID"
            error={errors.externalId}
            description={creating ? "For example SD-0042. It can't be changed later." : undefined}
          >
            {(aria) => (
              <Input
                {...aria}
                name="externalId"
                defaultValue={values.externalId}
                readOnly={!creating}
                className="font-mono"
              />
            )}
          </FormField>
          <FormField
            id="design-slug"
            label="URL slug"
            error={errors.slug}
            description="Used in the address: /design/your-slug"
          >
            {(aria) => (
              <Input {...aria} name="slug" defaultValue={values.slug} className="font-mono" />
            )}
          </FormField>
        </div>
        <FormField id="design-title" label="Title" error={errors.title}>
          {(aria) => <Input {...aria} name="title" defaultValue={values.title} />}
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="design-kind" label="Kind" error={errors.kind}>
            {(aria) => (
              <NativeSelect {...aria} name="kind" defaultValue={values.kind} className="w-full">
                <NativeSelectOption value="SYSTEM_DESIGN">System design</NativeSelectOption>
                <NativeSelectOption value="LOW_LEVEL_DESIGN">Low-level design</NativeSelectOption>
              </NativeSelect>
            )}
          </FormField>
          <FormField id="design-difficulty" label="Difficulty" error={errors.difficulty}>
            {(aria) => (
              <NativeSelect
                {...aria}
                name="difficulty"
                defaultValue={values.difficulty}
                className="w-full"
              >
                <NativeSelectOption value="EASY">Easy</NativeSelectOption>
                <NativeSelectOption value="MEDIUM">Medium</NativeSelectOption>
                <NativeSelectOption value="HARD">Hard</NativeSelectOption>
              </NativeSelect>
            )}
          </FormField>
        </div>
        {text("prompt", "Question (Markdown)", 5)}
        {text("requirements", "Requirements (Markdown)", 5, "Functional and non-functional.")}
        {text("approach", "Approach (Markdown)", 8, "A model answer, step by step.")}
        {text("tradeoffs", "Trade-offs (Markdown)", 5)}
        {text("followUps", "Follow-up questions (optional)", 3)}
        <FormField
          id="design-companies"
          label="Asked at (company slugs)"
          error={errors.companies}
          description="Separate with commas, for example acme-tech, globex."
        >
          {(aria) => (
            <Input
              {...aria}
              name="companies"
              defaultValue={values.companies.join(", ")}
              className="font-mono"
            />
          )}
        </FormField>
        <CheckboxGroup
          id="design-tracks"
          name="tracks"
          legend="Role tracks"
          options={tracks.map((t) => ({ value: t.slug, label: t.name }))}
          defaultValues={values.tracks}
          error={errors.tracks}
          emptyText="No role tracks yet."
        />
        <p className="text-xs text-muted-foreground">
          {creating
            ? "Saved as a draft. A reviewer publishes it."
            : "Saving a published question sends it back to draft until a reviewer publishes it again."}
        </p>
        {canEdit ? (
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : creating ? "Create question" : "Save changes"}
          </Button>
        ) : null}
      </fieldset>
    </form>
  );
}
