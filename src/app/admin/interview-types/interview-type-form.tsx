"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  saveInterviewTypeAction,
  type InterviewTypeFormState,
} from "@/app/admin/interview-types/actions";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";

const MAX_ITEMS = 10;

export type InterviewTypeFormValues = {
  id?: string;
  slug: string;
  name: string;
  description: string;
  audience: string;
  durationMin: number;
  priceSetting: string;
  order: number;
  active: boolean;
  rubric: { key: string; label: string; description: string }[];
};

type RubricRow = { rowId: number; key: string; label: string; description: string };

/** Creates (no id) or edits an interview type and its scorecard rubric. */
export function InterviewTypeForm({
  values,
  prices,
}: {
  values: InterviewTypeFormValues;
  /** Interview price settings, already formatted, e.g. "System design · ₹2,499". */
  prices: { key: string; label: string }[];
}) {
  const [state, onSubmit, pending] = useFormSubmit<InterviewTypeFormState>(
    saveInterviewTypeAction,
    {},
  );
  const errors = state.fieldErrors ?? {};
  const creating = !values.id;
  const [rows, setRows] = useState<RubricRow[]>(() =>
    (values.rubric.length ? values.rubric : [{ key: "", label: "", description: "" }]).map(
      (item, rowId) => ({ rowId, ...item }),
    ),
  );
  const [nextId, setNextId] = useState(rows.length);

  const update = (rowId: number, field: "label" | "description", value: string) =>
    setRows((current) => current.map((r) => (r.rowId === rowId ? { ...r, [field]: value } : r)));
  const add = () => {
    setRows((current) => [...current, { rowId: nextId, key: "", label: "", description: "" }]);
    setNextId((id) => id + 1);
  };
  const remove = (rowId: number) => setRows((current) => current.filter((r) => r.rowId !== rowId));

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Interview type">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={pending} className="min-w-0 space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="type-name" label="Name" error={errors.name}>
            {(aria) => <Input {...aria} name="name" defaultValue={values.name} />}
          </FormField>
          <FormField
            id="type-slug"
            label="URL slug"
            error={errors.slug}
            description={creating ? "It can't be changed later." : undefined}
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
        <FormField id="type-description" label="Description" error={errors.description}>
          {(aria) => (
            <Textarea {...aria} name="description" rows={2} defaultValue={values.description} />
          )}
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField id="type-audience" label="For" error={errors.audience}>
            {(aria) => (
              <NativeSelect
                {...aria}
                name="audience"
                defaultValue={values.audience}
                className="w-full"
              >
                <NativeSelectOption value="BOTH">Everyone</NativeSelectOption>
                <NativeSelectOption value="FRESHER">Freshers</NativeSelectOption>
                <NativeSelectOption value="EXPERIENCED">Experienced</NativeSelectOption>
              </NativeSelect>
            )}
          </FormField>
          <FormField id="type-duration" label="Length (minutes)" error={errors.durationMin}>
            {(aria) => (
              <Input
                {...aria}
                name="durationMin"
                inputMode="numeric"
                defaultValue={values.durationMin}
              />
            )}
          </FormField>
          <FormField
            id="type-price"
            label="Price"
            error={errors.priceSetting}
            description="Prices are changed in Settings."
          >
            {(aria) => (
              <NativeSelect
                {...aria}
                name="priceSetting"
                defaultValue={values.priceSetting}
                className="w-full"
              >
                <NativeSelectOption value="" disabled>
                  Choose…
                </NativeSelectOption>
                {prices.map((p) => (
                  <NativeSelectOption key={p.key} value={p.key}>
                    {p.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            id="type-order"
            label="Order"
            error={errors.order}
            description="Lower numbers first."
          >
            {(aria) => (
              <Input {...aria} name="order" inputMode="numeric" defaultValue={values.order} />
            )}
          </FormField>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="type-active" name="active" defaultChecked={values.active} />
          <Label htmlFor="type-active" className="font-normal">
            Students can book this type
          </Label>
        </div>

        <fieldset className="min-w-0 space-y-3 rounded-lg border p-4">
          <legend className="px-1 text-sm font-medium">Scorecard rubric</legend>
          <p className="text-xs text-muted-foreground">
            Interviewers score each item from 1 to 5. Past scorecards keep their scores when you
            rename or remove items.
          </p>
          {errors.rubric ? (
            <p className="text-xs font-medium text-destructive">{errors.rubric}</p>
          ) : null}
          <ol className="space-y-3">
            {rows.map((row, i) => (
              <li
                key={row.rowId}
                className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_2fr_auto] sm:items-end"
              >
                <input type="hidden" name="rubricKey" value={row.key} />
                <div className="space-y-1.5">
                  <Label htmlFor={`rubric-label-${row.rowId}`}>Item {i + 1}</Label>
                  <Input
                    id={`rubric-label-${row.rowId}`}
                    name="rubricLabel"
                    value={row.label}
                    onChange={(e) => update(row.rowId, "label", e.target.value)}
                    placeholder="Problem solving"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`rubric-description-${row.rowId}`}>What it measures</Label>
                  <Input
                    id={`rubric-description-${row.rowId}`}
                    name="rubricDescription"
                    value={row.description}
                    onChange={(e) => update(row.rowId, "description", e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(row.rowId)}
                  disabled={rows.length === 1}
                  aria-label={`Remove item ${i + 1}`}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ol>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={add}
            disabled={rows.length >= MAX_ITEMS}
          >
            <Plus /> Add item
          </Button>
        </fieldset>

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : creating ? "Create interview type" : "Save changes"}
        </Button>
      </fieldset>
    </form>
  );
}
