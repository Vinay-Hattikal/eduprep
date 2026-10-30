"use client";

import { useState } from "react";
import { saveDesignAction, type DesignFormState } from "@/app/admin/design/actions";
import { CheckboxGroup } from "@/components/shared/checkbox-group";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";
import type { DesignKind } from "@/generated/prisma/enums";
import { DESIGN_KIND_LABELS, INTERVIEW_KINDS } from "@/lib/content/design";

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

/** Field labels: design questions, and interview questions in the same four fields (D-067). */
const FIELD_LABELS = {
  design: {
    requirements: ["Requirements (Markdown)", "Functional and non-functional."],
    approach: ["Approach (Markdown)", "A model answer, step by step."],
    tradeoffs: ["Trade-offs (Markdown)", undefined],
  },
  interview: {
    requirements: ["What the interviewer looks for (Markdown)", "The points a good answer covers."],
    approach: ["A strong answer (Markdown)", "How a well-prepared candidate would answer."],
    tradeoffs: ["Common mistakes (Markdown)", "What weak answers do."],
  },
} as const;

/** Creates (no id) or edits a design question or an interview question. */
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
  const [kind, setKind] = useState(values.kind);
  const labels =
    FIELD_LABELS[INTERVIEW_KINDS.includes(kind as DesignKind) ? "interview" : "design"];
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
              <NativeSelect
                {...aria}
                name="kind"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full"
              >
                {Object.entries(DESIGN_KIND_LABELS).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
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
        {text("requirements", labels.requirements[0], 5, labels.requirements[1])}
        {text("approach", labels.approach[0], 8, labels.approach[1])}
        {text("tradeoffs", labels.tradeoffs[0], 5, labels.tradeoffs[1])}
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
          Drafts are hidden from students. Saving a published question as a draft unpublishes it.
        </p>
        {canEdit ? (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" name="intent" value="publish" disabled={pending}>
              {pending ? "Saving…" : "Save and publish"}
            </Button>
            <Button type="submit" name="intent" value="draft" variant="outline" disabled={pending}>
              Save as draft
            </Button>
          </div>
        ) : null}
      </fieldset>
    </form>
  );
}
