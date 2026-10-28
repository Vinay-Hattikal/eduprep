"use client";

import { ArrowLeft, ArrowRight, Briefcase, Check, GraduationCap, Plus, X } from "lucide-react";
import { useState } from "react";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { saveOnboardingAction, type OnboardingState } from "@/app/onboarding/actions";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { CGPA_BANDS } from "@/lib/learning/eligibility";
import { cn } from "@/lib/utils";
import { BRANCHES, DEGREES, LANGUAGES, MAX_TARGETS } from "@/schemas/onboarding";

export type OnboardingInitial = {
  name: string;
  profileType: "FRESHER" | "EXPERIENCED";
  preferredLanguage: string;
  college: string;
  degree: string;
  branch: string;
  gradYear: string;
  cgpaBand: string;
  hasBacklogs: boolean;
  currentRole: string;
  yearsExperience: string;
  currentCompany: string;
  techStack: string;
  targetRoles: string;
  targets: { companyId: string; targetDate: string }[];
};

type CompanyOption = { id: string; name: string };

const STEPS = ["About you", "Your goals", "Coding"] as const;

/** Which step each field lives on, to jump back to the first error. */
const FIELD_STEP: Record<string, number> = {
  name: 0,
  profileType: 0,
  college: 0,
  degree: 0,
  branch: 0,
  gradYear: 0,
  cgpaBand: 0,
  hasBacklogs: 0,
  currentRole: 0,
  yearsExperience: 0,
  currentCompany: 0,
  techStack: 0,
  targetRoles: 0,
  targets: 1,
  preferredLanguage: 2,
};

const initialState: OnboardingState = {};

export function OnboardingForm({
  initial,
  companies,
  gradYears,
  isEdit,
}: {
  initial: OnboardingInitial;
  companies: CompanyOption[];
  gradYears: number[];
  isEdit: boolean;
}) {
  const [state, onSubmit, pending] = useFormSubmit(saveOnboardingAction, initialState);
  const [step, setStep] = useState(0);
  const [type, setType] = useState(initial.profileType);
  const [targets, setTargets] = useState(
    initial.targets.length ? initial.targets : [{ companyId: "", targetDate: "" }],
  );
  const errors = state.fieldErrors ?? {};

  // When the server returns errors, jump to the first step that has one (adjusting state
  // during render on a new result, as React recommends, instead of in an effect).
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    const first = Object.keys(state.fieldErrors ?? {})
      .map((field) => FIELD_STEP[field] ?? 0)
      .sort()[0];
    if (first !== undefined) setStep(first);
  }

  const chosen = new Set(targets.map((t) => t.companyId).filter(Boolean));

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <ol className="flex items-center gap-2" aria-label="Steps">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              aria-current={index === step ? "step" : undefined}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                index < step && "border-primary bg-primary text-primary-foreground",
                index === step && "border-primary text-primary",
                index > step && "text-muted-foreground",
              )}
            >
              {index < step ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
            </span>
            <span
              className={cn(
                "hidden text-sm sm:inline",
                index === step ? "font-medium" : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {index < STEPS.length - 1 ? (
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            ) : null}
          </li>
        ))}
      </ol>

      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}

      {/* Step 1: about you. All steps stay mounted so every answer is submitted together. */}
      <section hidden={step !== 0} className="space-y-5" aria-label="About you">
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">I am…</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                {
                  value: "FRESHER",
                  title: "A student or fresher",
                  text: "Campus and off-campus drives",
                  icon: GraduationCap,
                },
                {
                  value: "EXPERIENCED",
                  title: "An experienced engineer",
                  text: "Switching jobs or roles",
                  icon: Briefcase,
                },
              ] as const
            ).map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  type === option.value ? "border-primary bg-secondary/50" : "hover:bg-muted/50",
                )}
              >
                <input
                  type="radio"
                  name="profileType"
                  value={option.value}
                  checked={type === option.value}
                  onChange={() => setType(option.value)}
                  className="sr-only"
                />
                <option.icon className="mt-0.5 size-5 text-primary" aria-hidden="true" />
                <span>
                  <span className="block font-medium">{option.title}</span>
                  <span className="text-sm text-muted-foreground">{option.text}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <FormField id="name" label="Your name" error={errors.name}>
          {(aria) => (
            <Input {...aria} name="name" defaultValue={initial.name} autoComplete="name" />
          )}
        </FormField>

        <div hidden={type !== "FRESHER"} className="grid gap-4 sm:grid-cols-2">
          <FormField id="college" label="College" error={errors.college} className="sm:col-span-2">
            {(aria) => (
              <Input
                {...aria}
                name="college"
                defaultValue={initial.college}
                autoComplete="organization"
              />
            )}
          </FormField>
          <FormField id="degree" label="Degree" error={errors.degree}>
            {(aria) => (
              <NativeSelect
                {...aria}
                name="degree"
                defaultValue={initial.degree}
                className="w-full"
              >
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {DEGREES.map((d) => (
                  <NativeSelectOption key={d} value={d}>
                    {d}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField id="branch" label="Branch" error={errors.branch}>
            {(aria) => (
              <NativeSelect
                {...aria}
                name="branch"
                defaultValue={initial.branch}
                className="w-full"
              >
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {BRANCHES.map((b) => (
                  <NativeSelectOption key={b} value={b}>
                    {b}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField id="gradYear" label="Graduation year" error={errors.gradYear}>
            {(aria) => (
              <NativeSelect
                {...aria}
                name="gradYear"
                defaultValue={initial.gradYear}
                className="w-full"
              >
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {gradYears.map((y) => (
                  <NativeSelectOption key={y} value={String(y)}>
                    {y}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            id="cgpaBand"
            label="CGPA"
            error={errors.cgpaBand}
            description="Used to check company eligibility."
          >
            {(aria) => (
              <NativeSelect
                {...aria}
                name="cgpaBand"
                defaultValue={initial.cgpaBand}
                className="w-full"
              >
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {CGPA_BANDS.map((b) => (
                  <NativeSelectOption key={b} value={b}>
                    {b}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <fieldset className="space-y-2 sm:col-span-2">
            <legend className="text-sm font-medium">Any active backlogs?</legend>
            <div className="flex gap-6">
              {(["no", "yes"] as const).map((value) => (
                <div key={value} className="flex items-center gap-2">
                  <input
                    type="radio"
                    id={`backlogs-${value}`}
                    name="hasBacklogs"
                    value={value}
                    defaultChecked={initial.hasBacklogs === (value === "yes")}
                    className="size-4 accent-[var(--primary)]"
                  />
                  <Label htmlFor={`backlogs-${value}`}>{value === "yes" ? "Yes" : "No"}</Label>
                </div>
              ))}
            </div>
          </fieldset>
        </div>

        <div hidden={type !== "EXPERIENCED"} className="grid gap-4 sm:grid-cols-2">
          <FormField id="currentRole" label="Current role" error={errors.currentRole}>
            {(aria) => (
              <Input
                {...aria}
                name="currentRole"
                defaultValue={initial.currentRole}
                placeholder="e.g. Software Engineer"
              />
            )}
          </FormField>
          <FormField
            id="yearsExperience"
            label="Years of experience"
            error={errors.yearsExperience}
          >
            {(aria) => (
              <Input
                {...aria}
                name="yearsExperience"
                inputMode="numeric"
                defaultValue={initial.yearsExperience}
              />
            )}
          </FormField>
          <FormField
            id="currentCompany"
            label="Current company (optional)"
            error={errors.currentCompany}
          >
            {(aria) => (
              <Input {...aria} name="currentCompany" defaultValue={initial.currentCompany} />
            )}
          </FormField>
          <FormField
            id="techStack"
            label="Tech stack"
            description="Separate with commas, e.g. Java, Spring Boot, SQL."
          >
            {(aria) => <Input {...aria} name="techStack" defaultValue={initial.techStack} />}
          </FormField>
          <FormField
            id="targetRoles"
            label="Roles you're aiming for"
            description="e.g. SDE-2, Backend Engineer"
            className="sm:col-span-2"
          >
            {(aria) => <Input {...aria} name="targetRoles" defaultValue={initial.targetRoles} />}
          </FormField>
        </div>
      </section>

      {/* Step 2: target companies */}
      <section hidden={step !== 1} className="space-y-4" aria-label="Your goals">
        <div className="space-y-1">
          <h2 className="font-medium">Which companies are you preparing for?</h2>
          <p className="text-sm text-muted-foreground">
            Up to {MAX_TARGETS}. Add the test or interview date if you know it, and we&apos;ll track
            your readiness for each.
          </p>
        </div>
        {companies.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No companies are listed yet. You can add them later from your dashboard.
          </p>
        ) : (
          <ul className="space-y-3">
            {targets.map((target, index) => (
              <li key={index} className="flex flex-wrap items-end gap-3 rounded-xl border p-3">
                <div className="min-w-48 flex-1 space-y-1.5">
                  <Label htmlFor={`target-${index}`}>Company {index + 1}</Label>
                  <NativeSelect
                    id={`target-${index}`}
                    name="targetCompanyId"
                    value={target.companyId}
                    className="w-full"
                    onChange={(e) =>
                      setTargets((all) =>
                        all.map((t, i) => (i === index ? { ...t, companyId: e.target.value } : t)),
                      )
                    }
                  >
                    <NativeSelectOption value="">Choose a company…</NativeSelectOption>
                    {companies.map((c) => (
                      <NativeSelectOption
                        key={c.id}
                        value={c.id}
                        disabled={chosen.has(c.id) && c.id !== target.companyId}
                      >
                        {c.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </div>
                <div className="w-44 space-y-1.5">
                  <Label htmlFor={`target-date-${index}`}>Date (optional)</Label>
                  <Input
                    id={`target-date-${index}`}
                    type="date"
                    name="targetDate"
                    value={target.targetDate}
                    onChange={(e) =>
                      setTargets((all) =>
                        all.map((t, i) => (i === index ? { ...t, targetDate: e.target.value } : t)),
                      )
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove company ${index + 1}`}
                  onClick={() =>
                    setTargets((all) =>
                      all.length === 1
                        ? [{ companyId: "", targetDate: "" }]
                        : all.filter((_, i) => i !== index),
                    )
                  }
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
        )}
        {companies.length > 0 && targets.length < MAX_TARGETS ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTargets((all) => [...all, { companyId: "", targetDate: "" }])}
          >
            <Plus /> Add another company
          </Button>
        ) : null}
        {errors.targets ? (
          <p className="text-xs font-medium text-destructive">{errors.targets}</p>
        ) : null}
      </section>

      {/* Step 3: coding language */}
      <section hidden={step !== 2} className="space-y-4" aria-label="Coding">
        <fieldset className="space-y-3">
          <legend className="font-medium">Which language will you code in?</legend>
          <p className="text-sm text-muted-foreground">
            Coding problems open in this language. You can switch any time.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(LANGUAGES).map(([value, label]) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-secondary/50 has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
              >
                <input
                  type="radio"
                  name="preferredLanguage"
                  value={value}
                  defaultChecked={initial.preferredLanguage === value}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="text-sm font-medium">{label}</span>
              </label>
            ))}
          </div>
          {errors.preferredLanguage ? (
            <p className="text-xs font-medium text-destructive">{errors.preferredLanguage}</p>
          ) : null}
        </fieldset>
      </section>

      <div className="flex items-center justify-between gap-3 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => s - 1)}
          disabled={step === 0}
          className={step === 0 ? "invisible" : ""}
        >
          <ArrowLeft /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          // Distinct keys: React must not reuse this button as the submit button below, or one
          // click would advance the step *and* submit the form.
          <Button key="continue" type="button" onClick={() => setStep((s) => s + 1)}>
            Continue <ArrowRight data-icon="inline-end" />
          </Button>
        ) : (
          <Button key="submit" type="submit" disabled={pending} data-testid="finish-onboarding">
            {pending ? "Saving…" : isEdit ? "Save changes" : "Start preparing"}
          </Button>
        )}
      </div>
    </form>
  );
}
