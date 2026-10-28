"use client";

import { Save } from "lucide-react";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { saveCompanyAction, type CompanyFormState } from "@/app/admin/companies/actions";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_LABELS, LEVEL_LABELS } from "@/lib/content/companies";

export type CompanyFormValues = {
  id?: string;
  slug: string;
  name: string;
  level: string;
  category: string;
  hiringFor: string[];
  overview: string;
  website: string;
  careersUrl: string;
  ctcFresher: string;
  ctcExperienced: string;
  minCgpa: string;
  min10thPercent: string;
  min12thPercent: string;
  maxBacklogs: string;
  maxGapYears: string;
  branches: string;
  gradYears: string;
  lastVerifiedAt: string;
};

const initialState: CompanyFormState = {};

function Text({
  name,
  label,
  values,
  errors,
  description,
  readOnly,
}: {
  name: keyof CompanyFormValues;
  label: string;
  values: CompanyFormValues;
  errors: Record<string, string>;
  description?: string;
  readOnly?: boolean;
}) {
  return (
    <FormField id={`company-${name}`} label={label} error={errors[name]} description={description}>
      {(aria) => (
        <Input {...aria} name={name} defaultValue={values[name] as string} readOnly={readOnly} />
      )}
    </FormField>
  );
}

export function CompanyForm({ values, canEdit }: { values: CompanyFormValues; canEdit: boolean }) {
  const [state, onSubmit, pending] = useFormSubmit(saveCompanyAction, initialState);
  const errors = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="Company profile">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={!canEdit || pending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Text name="name" label="Name" values={values} errors={errors} />
            <Text
              name="slug"
              label="Slug"
              values={values}
              errors={errors}
              readOnly={Boolean(values.id)}
              description={
                values.id ? "Slugs are permanent (used in URLs and imports)." : "e.g. tcs"
              }
            />
            <FormField id="company-level" label="Level" error={errors.level}>
              {(aria) => (
                <NativeSelect {...aria} name="level" defaultValue={values.level} className="w-full">
                  {Object.entries(LEVEL_LABELS).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField id="company-category" label="Category" error={errors.category}>
              {(aria) => (
                <NativeSelect
                  {...aria}
                  name="category"
                  defaultValue={values.category}
                  className="w-full"
                >
                  {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">Hiring for</legend>
              <div className="flex gap-6">
                {(["FRESHER", "EXPERIENCED"] as const).map((value) => (
                  <div key={value} className="flex items-center gap-2">
                    <Checkbox
                      id={`hiring-${value}`}
                      name="hiringFor"
                      value={value}
                      defaultChecked={values.hiringFor.includes(value)}
                    />
                    <Label htmlFor={`hiring-${value}`}>
                      {value === "FRESHER" ? "Freshers" : "Experienced"}
                    </Label>
                  </div>
                ))}
              </div>
              {errors.hiringFor ? (
                <p className="text-xs font-medium text-destructive">{errors.hiringFor}</p>
              ) : null}
            </fieldset>
            <FormField
              id="company-overview"
              label="Overview"
              error={errors.overview}
              description="Markdown."
              className="sm:col-span-2"
            >
              {(aria) => (
                <Textarea {...aria} name="overview" rows={5} defaultValue={values.overview} />
              )}
            </FormField>
            <Text name="website" label="Website" values={values} errors={errors} />
            <Text name="careersUrl" label="Careers page" values={values} errors={errors} />
            <Text
              name="ctcFresher"
              label="CTC for freshers"
              values={values}
              errors={errors}
              description="e.g. 3.5–7 LPA"
            />
            <Text
              name="ctcExperienced"
              label="CTC for experienced"
              values={values}
              errors={errors}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Eligibility</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <Text name="minCgpa" label="Minimum CGPA" values={values} errors={errors} />
            <Text name="min10thPercent" label="Minimum 10th %" values={values} errors={errors} />
            <Text name="min12thPercent" label="Minimum 12th %" values={values} errors={errors} />
            <Text
              name="maxBacklogs"
              label="Active backlogs allowed"
              values={values}
              errors={errors}
            />
            <Text name="maxGapYears" label="Max gap (years)" values={values} errors={errors} />
            <Text
              name="gradYears"
              label="Graduation years"
              values={values}
              errors={errors}
              description="e.g. 2026, 2027"
            />
            <Text
              name="branches"
              label="Branches"
              values={values}
              errors={errors}
              description="e.g. CSE, IT, ECE, or ANY"
            />
            <FormField
              id="company-lastVerifiedAt"
              label="Last verified"
              error={errors.lastVerifiedAt}
            >
              {(aria) => (
                <Input
                  {...aria}
                  type="date"
                  name="lastVerifiedAt"
                  defaultValue={values.lastVerifiedAt}
                  required
                />
              )}
            </FormField>
          </CardContent>
        </Card>
      </fieldset>

      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            <Save /> {pending ? "Saving…" : values.id ? "Save changes" : "Create company"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Saving a published company sends it back to draft.
          </p>
        </div>
      ) : null}
    </form>
  );
}
