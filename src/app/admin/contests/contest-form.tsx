"use client";

import { Save } from "lucide-react";
import { saveContestAction, type ContestFormState } from "@/app/admin/contests/actions";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";

export type ContestFormValues = {
  id?: string;
  title: string;
  slug: string;
  description: string;
  blueprintId: string;
  startsAt: string;
  endsAt: string;
};

const initialState: ContestFormState = {};

export function ContestForm({
  values,
  blueprints,
  readOnly,
}: {
  values: ContestFormValues;
  blueprints: { id: string; title: string; minutes: number; items: number }[];
  readOnly?: boolean;
}) {
  const [state, onSubmit, pending] = useFormSubmit(saveContestAction, initialState);
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="All-India mock">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={pending || readOnly} className="space-y-6">
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
            <FormField id="contest-title" label="Title" error={e.title}>
              {(aria) => (
                <Input
                  {...aria}
                  name="title"
                  defaultValue={values.title}
                  placeholder="Weekly All-India Mock #12"
                />
              )}
            </FormField>
            <FormField id="contest-slug" label="Slug" error={e.slug} description="Used in the URL.">
              {(aria) => <Input {...aria} name="slug" defaultValue={values.slug} />}
            </FormField>
            <FormField
              id="contest-blueprint"
              label="Test format"
              error={e.blueprintId}
              description="A mock test blueprint: its sections, timers, marking and topic rules. Drafts work too."
              className="sm:col-span-2"
            >
              {(aria) => (
                <NativeSelect
                  {...aria}
                  name="blueprintId"
                  defaultValue={values.blueprintId}
                  className="w-full"
                >
                  <NativeSelectOption value="" disabled>
                    Choose a format
                  </NativeSelectOption>
                  {blueprints.map((b) => (
                    <NativeSelectOption key={b.id} value={b.id}>
                      {b.title} ({b.items} questions, {b.minutes} min)
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField
              id="contest-startsAt"
              label="Opens (IST)"
              error={e.startsAt}
              description="Students can start from this moment."
            >
              {(aria) => (
                <Input
                  {...aria}
                  type="datetime-local"
                  name="startsAt"
                  defaultValue={values.startsAt}
                />
              )}
            </FormField>
            <FormField
              id="contest-endsAt"
              label="Last start (IST)"
              error={e.endsAt}
              description="Results are final one test-length after this."
            >
              {(aria) => (
                <Input {...aria} type="datetime-local" name="endsAt" defaultValue={values.endsAt} />
              )}
            </FormField>
            <FormField
              id="contest-description"
              label="Description (optional)"
              error={e.description}
              className="sm:col-span-2"
            >
              {(aria) => (
                <Textarea {...aria} name="description" rows={3} defaultValue={values.description} />
              )}
            </FormField>
          </CardContent>
        </Card>
        {readOnly ? null : (
          <Button type="submit" disabled={pending}>
            <Save /> {pending ? "Saving…" : "Save"}
          </Button>
        )}
      </fieldset>
    </form>
  );
}
