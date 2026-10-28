"use client";

import { Save } from "lucide-react";
import { savePostingAction, type PostingFormState } from "@/app/admin/postings/actions";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { JOB_TYPE_LABELS, WORK_MODE_LABELS } from "@/lib/jobs/postings";

export type PostingFormValues = {
  id?: string;
  title: string;
  companyId: string;
  companyName: string;
  locations: string;
  workMode: string;
  jobType: string;
  audience: string[];
  minExperience: string;
  maxExperience: string;
  salary: string;
  skills: string;
  description: string;
  branches: string;
  gradYears: string;
  minCgpa: string;
  maxBacklogs: string;
  applyUrl: string;
  applyBy: string;
};

const initialState: PostingFormState = {};

export function PostingForm({
  values,
  companies,
}: {
  values: PostingFormValues;
  companies: { id: string; name: string }[];
}) {
  const [state, onSubmit, pending] = useFormSubmit(savePostingAction, initialState);
  const errors = state.fieldErrors ?? {};
  const text = (
    name: keyof PostingFormValues,
    label: string,
    options: { description?: string; type?: string; placeholder?: string } = {},
  ) => (
    <FormField
      id={`posting-${name}`}
      label={label}
      error={errors[name]}
      description={options.description}
    >
      {(aria) => (
        <Input
          {...aria}
          name={name}
          type={options.type}
          placeholder={options.placeholder}
          defaultValue={values[name] as string}
        />
      )}
    </FormField>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6" aria-label="Job posting">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={pending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>The job</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {text("title", "Job title", { placeholder: "Graduate Engineer Trainee" })}
            {text("companyName", "Employer", {
              description: "As students know it, e.g. Infosys.",
            })}
            <FormField
              id="posting-companyId"
              label="Company page (optional)"
              error={errors.companyId}
              description="Links the job to a company's hiring process and practice."
            >
              {(aria) => (
                <NativeSelect
                  {...aria}
                  name="companyId"
                  defaultValue={values.companyId}
                  className="w-full"
                >
                  <NativeSelectOption value="">No company page</NativeSelectOption>
                  {companies.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            {text("applyUrl", "Application link", {
              type: "url",
              placeholder: "https://careers.example.com/jobs/123",
              description: "The employer's own page. Students are sent straight there.",
            })}
            <FormField id="posting-jobType" label="Type" error={errors.jobType}>
              {(aria) => (
                <NativeSelect
                  {...aria}
                  name="jobType"
                  defaultValue={values.jobType}
                  className="w-full"
                >
                  {Object.entries(JOB_TYPE_LABELS).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            <FormField id="posting-workMode" label="Work mode" error={errors.workMode}>
              {(aria) => (
                <NativeSelect
                  {...aria}
                  name="workMode"
                  defaultValue={values.workMode}
                  className="w-full"
                >
                  {Object.entries(WORK_MODE_LABELS).map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              )}
            </FormField>
            {text("locations", "Locations", { description: "Cities, comma-separated." })}
            {text("salary", "Pay (optional)", { placeholder: "4–6 LPA" })}
            {text("applyBy", "Last day to apply (optional)", {
              type: "date",
              description: "The job closes itself after this day.",
            })}
            {text("skills", "Skills", { description: "Comma-separated, e.g. Java, SQL." })}
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">For</legend>
              <div className="flex gap-6">
                {(["FRESHER", "EXPERIENCED"] as const).map((value) => (
                  <div key={value} className="flex items-center gap-2">
                    <Checkbox
                      id={`audience-${value}`}
                      name="audience"
                      value={value}
                      defaultChecked={values.audience.includes(value)}
                    />
                    <Label htmlFor={`audience-${value}`}>
                      {value === "FRESHER" ? "Freshers" : "Experienced"}
                    </Label>
                  </div>
                ))}
              </div>
              {errors.audience ? (
                <p className="text-xs font-medium text-destructive">{errors.audience}</p>
              ) : null}
            </fieldset>
            <FormField
              id="posting-description"
              label="Description"
              error={errors.description}
              description="Markdown: responsibilities, requirements, the selection process."
              className="sm:col-span-2"
            >
              {(aria) => (
                <Textarea
                  {...aria}
                  name="description"
                  rows={10}
                  defaultValue={values.description}
                />
              )}
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Who can apply</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            {text("minExperience", "Experience from (years)")}
            {text("maxExperience", "Experience up to (years)", {
              description: "0 and 0 means freshers only.",
            })}
            {text("gradYears", "Batches", { description: "e.g. 2026, 2027" })}
            {text("branches", "Branches", { description: "e.g. CSE, IT, ECE, or ANY" })}
            {text("minCgpa", "Minimum CGPA")}
            {text("maxBacklogs", "Active backlogs allowed")}
          </CardContent>
        </Card>

        <Button type="submit" disabled={pending}>
          <Save /> {pending ? "Saving…" : "Save"}
        </Button>
      </fieldset>
    </form>
  );
}
