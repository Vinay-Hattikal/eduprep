"use client";

import { shareExperienceAction, type ShareState } from "@/app/(student)/experiences/actions";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";

export function ShareForm({
  companies,
  defaultCompany,
  profileType,
}: {
  companies: { id: string; name: string }[];
  defaultCompany?: string;
  profileType: string | null;
}) {
  const [state, onSubmit, pending] = useFormSubmit<ShareState>(shareExperienceAction, {});
  const e = state.fieldErrors ?? {};
  if (state.done) {
    return (
      <Alert data-testid="experience-sent">
        <AlertDescription>
          Thank you! A moderator checks every experience before it goes live; you&apos;ll get points
          when it&apos;s published.
        </AlertDescription>
      </Alert>
    );
  }
  const year = new Date().getFullYear();
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="companyId" label="Company" error={e.companyId}>
          {(aria) => (
            <NativeSelect
              {...aria}
              name="companyId"
              className="w-full"
              defaultValue={defaultCompany ?? ""}
            >
              <NativeSelectOption value="" disabled>
                Choose a company
              </NativeSelectOption>
              {companies.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField
          id="role"
          label="Role"
          error={e.role}
          description="e.g. Software Engineer, Systems Engineer"
        >
          {(aria) => <Input {...aria} name="role" />}
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <FormField id="profileType" label="You were a" error={e.profileType}>
          {(aria) => (
            <NativeSelect
              {...aria}
              name="profileType"
              className="w-full"
              defaultValue={profileType === "EXPERIENCED" ? "EXPERIENCED" : "FRESHER"}
            >
              <NativeSelectOption value="FRESHER">Fresher</NativeSelectOption>
              <NativeSelectOption value="EXPERIENCED">Experienced</NativeSelectOption>
            </NativeSelect>
          )}
        </FormField>
        <FormField id="yearsExperience" label="Years of experience" error={e.yearsExperience}>
          {(aria) => <Input {...aria} name="yearsExperience" inputMode="numeric" />}
        </FormField>
        <FormField id="year" label="Year" error={e.year}>
          {(aria) => (
            <NativeSelect {...aria} name="year" className="w-full" defaultValue={String(year)}>
              {[0, 1, 2, 3].map((d) => (
                <NativeSelectOption key={d} value={String(year - d)}>
                  {year - d}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField id="result" label="Result" error={e.result}>
          {(aria) => (
            <NativeSelect {...aria} name="result" className="w-full" defaultValue="WAITING">
              <NativeSelectOption value="SELECTED">Selected</NativeSelectOption>
              <NativeSelectOption value="REJECTED">Not selected</NativeSelectOption>
              <NativeSelectOption value="WAITING">Waiting</NativeSelectOption>
              <NativeSelectOption value="WITHDREW">Withdrew</NativeSelectOption>
            </NativeSelect>
          )}
        </FormField>
      </div>
      <FormField
        id="rounds"
        label="Rounds"
        error={e.rounds}
        description="Each round: format, duration, platform, what happened."
      >
        {(aria) => <Textarea {...aria} name="rounds" rows={6} />}
      </FormField>
      <FormField
        id="questions"
        label="Questions asked"
        error={e.questions}
        description="Rewrite them in your own words."
      >
        {(aria) => <Textarea {...aria} name="questions" rows={5} />}
      </FormField>
      <FormField id="tips" label="Tips for others (optional)" error={e.tips}>
        {(aria) => <Textarea {...aria} name="tips" rows={3} />}
      </FormField>
      <FormField id="anonymous" label="Show my name?">
        {(aria) => (
          <NativeSelect {...aria} name="anonymous" defaultValue="yes">
            <NativeSelectOption value="yes">No, post anonymously</NativeSelectOption>
            <NativeSelectOption value="no">Yes, show my name</NativeSelectOption>
          </NativeSelect>
        )}
      </FormField>
      <Button type="submit" disabled={pending} data-testid="share-experience">
        {pending ? "Sending…" : "Share experience"}
      </Button>
    </form>
  );
}
