"use client";

import { useState } from "react";
import { savePassageAction, type PassageFormState } from "@/app/admin/passages/actions";
import { FormField } from "@/components/shared/form-field";
import { Markdown } from "@/components/shared/markdown";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";

export type PassageFormValues = { id?: string; externalId: string; title: string; body: string };

/** Creates (no id) or edits a passage, with a live preview of the Markdown. */
export function PassageForm({
  values,
  canEdit,
  liveQuestions,
}: {
  values: PassageFormValues;
  canEdit: boolean;
  /** Published questions that show this passage; edits reach them straight away. */
  liveQuestions: number;
}) {
  const [state, onSubmit, pending] = useFormSubmit<PassageFormState>(savePassageAction, {});
  const errors = state.fieldErrors ?? {};
  const creating = !values.id;
  const [body, setBody] = useState(values.body);

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Passage">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={!canEdit || pending} className="min-w-0 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_2fr]">
          <FormField
            id="passage-externalId"
            label="ID"
            error={errors.externalId}
            description={creating ? "For example RC-0042. It can't be changed later." : undefined}
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
          <FormField id="passage-title" label="Title" error={errors.title}>
            {(aria) => <Input {...aria} name="title" defaultValue={values.title} />}
          </FormField>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <FormField
            id="passage-body"
            label="Passage (Markdown, tables and LaTeX allowed)"
            error={errors.body}
          >
            {(aria) => (
              <Textarea
                {...aria}
                name="body"
                rows={16}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="font-mono text-sm"
              />
            )}
          </FormField>
          <div className="min-w-0 space-y-1.5">
            <p className="text-sm font-medium">Preview</p>
            <div className="max-h-[26rem] overflow-auto rounded-lg border bg-surface p-4">
              {body.trim() ? (
                <Markdown>{body}</Markdown>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>
              )}
            </div>
          </div>
        </div>
        {liveQuestions ? (
          <Alert>
            <AlertDescription>
              {liveQuestions} published {liveQuestions === 1 ? "question shows" : "questions show"}{" "}
              this passage. Saving changes what students see straight away.
            </AlertDescription>
          </Alert>
        ) : null}
        {canEdit ? (
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : creating ? "Create passage" : "Save changes"}
          </Button>
        ) : null}
      </fieldset>
    </form>
  );
}
