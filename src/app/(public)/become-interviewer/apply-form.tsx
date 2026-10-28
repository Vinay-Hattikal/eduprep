"use client";

import { applyAction, type ApplyState } from "@/app/(public)/become-interviewer/actions";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";

export function ApplyForm({ types }: { types: { id: string; name: string }[] }) {
  const [state, onSubmit, pending] = useFormSubmit<ApplyState>(applyAction, {});
  const e = state.fieldErrors ?? {};
  if (state.done) {
    return (
      <Alert data-testid="application-sent">
        <AlertDescription>
          Thanks! We review applications within a few days and email you the decision.
        </AlertDescription>
      </Alert>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <FormField
        id="headline"
        label="Headline"
        error={e.headline}
        description="e.g. SDE-2 at a fintech, 6 years, ex-service company"
      >
        {(aria) => <Input {...aria} name="headline" />}
      </FormField>
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="currentCompany" label="Company" error={e.currentCompany}>
          {(aria) => <Input {...aria} name="currentCompany" />}
        </FormField>
        <FormField id="currentRole" label="Role" error={e.currentRole}>
          {(aria) => <Input {...aria} name="currentRole" />}
        </FormField>
        <FormField id="yearsExperience" label="Years of experience" error={e.yearsExperience}>
          {(aria) => <Input {...aria} name="yearsExperience" inputMode="numeric" />}
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="pastCompanies"
          label="Past companies"
          description="Comma-separated"
          error={e.pastCompanies}
        >
          {(aria) => <Input {...aria} name="pastCompanies" />}
        </FormField>
        <FormField
          id="languages"
          label="Languages you interview in"
          description="e.g. English, Hindi"
          error={e.languages}
        >
          {(aria) => <Input {...aria} name="languages" />}
        </FormField>
      </div>
      <FormField id="linkedinUrl" label="LinkedIn profile" error={e.linkedinUrl}>
        {(aria) => (
          <Input
            {...aria}
            name="linkedinUrl"
            type="url"
            placeholder="https://www.linkedin.com/in/…"
          />
        )}
      </FormField>
      <FormField
        id="bio"
        label="About you"
        description="What you've interviewed for and how you give feedback."
        error={e.bio}
      >
        {(aria) => <Textarea {...aria} name="bio" rows={4} />}
      </FormField>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Interviews you can take</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {types.map((t) => (
            <div key={t.id} className="flex items-center gap-2">
              <Checkbox id={`type-${t.id}`} name="typeIds" value={t.id} />
              <Label htmlFor={`type-${t.id}`} className="font-normal">
                {t.name}
              </Label>
            </div>
          ))}
        </div>
        {e.typeIds ? <p className="text-xs font-medium text-destructive">{e.typeIds}</p> : null}
      </fieldset>
      <Button type="submit" disabled={pending} data-testid="apply-interviewer">
        {pending ? "Sending…" : "Apply"}
      </Button>
    </form>
  );
}
