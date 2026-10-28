"use client";

import { useState } from "react";
import {
  addTestCaseAction,
  saveProblemAction,
  saveSolutionAction,
  transitionProblemAction,
  type ProblemFormState,
} from "@/app/admin/problems/actions";
import { CheckboxGroup } from "@/components/shared/checkbox-group";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CODING_LANGUAGE_IDS, CODING_LANGUAGES } from "@/lib/coding/languages";
import { ACTION_LABELS, type QuestionAction } from "@/lib/content/workflow";
import type { ProblemFormValues } from "@/app/admin/problems/problem-defaults";
import { useFormSubmit } from "@/hooks/use-form-submit";

export function ProblemWorkflow({ id, actions }: { id: string; actions: QuestionAction[] }) {
  const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) =>
        action === "reject" ? (
          <Dialog key={action} open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">{ACTION_LABELS[action]}</Button>
            </DialogTrigger>
            <DialogContent>
              <form action={transitionProblemAction} className="space-y-4">
                <DialogHeader>
                  <DialogTitle>Send back to draft</DialogTitle>
                  <DialogDescription>Tell the author what to fix.</DialogDescription>
                </DialogHeader>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="action" value="reject" />
                <div className="space-y-1.5">
                  <Label htmlFor="review-note">What needs to change?</Label>
                  <Textarea id="review-note" name="note" rows={4} required />
                </div>
                <DialogFooter>
                  <Button type="submit">Send back</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : (
          <form key={action} action={transitionProblemAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="action" value={action} />
            <Button
              type="submit"
              variant={
                action === "archive" ? "destructive" : action === "restore" ? "outline" : "default"
              }
              data-testid={`problem-${action}`}
            >
              {ACTION_LABELS[action]}
            </Button>
          </form>
        ),
      )}
    </div>
  );
}

const LANGUAGE_OPTIONS = CODING_LANGUAGE_IDS.map((id) => ({
  value: id,
  label: CODING_LANGUAGES[id].label,
}));

/** Creates a problem (no id) or edits one. */
export function ProblemForm({
  values,
  topics,
}: {
  values: ProblemFormValues;
  topics: { id: string; name: string }[];
}) {
  const [state, onSubmit, pending] = useFormSubmit<ProblemFormState>(saveProblemAction, {});
  const errors = state.fieldErrors ?? {};
  const creating = !values.id;
  const text = (
    name: keyof ProblemFormValues,
    label: string,
    rows: number,
    description?: string,
  ) => (
    <FormField id={name} label={label} error={errors[name]} description={description}>
      {(aria) => (
        <Textarea
          {...aria}
          name={name}
          rows={rows}
          defaultValue={String(values[name] ?? "")}
          className="font-mono text-sm"
        />
      )}
    </FormField>
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4" aria-label="Coding problem">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="externalId"
          label="ID"
          error={errors.externalId}
          description={
            creating ? "For example DSA-ARR-0042. It can't be changed later." : undefined
          }
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
          id="slug"
          label="URL slug"
          error={errors.slug}
          description="Used in the address: /coding/your-slug"
        >
          {(aria) => (
            <Input {...aria} name="slug" defaultValue={values.slug} className="font-mono" />
          )}
        </FormField>
        <FormField id="title" label="Title" error={errors.title}>
          {(aria) => <Input {...aria} name="title" defaultValue={values.title} />}
        </FormField>
        <div className="grid grid-cols-2 gap-4">
          <FormField id="difficulty" label="Difficulty" error={errors.difficulty}>
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
          <FormField id="source" label="Source" error={errors.source}>
            {(aria) => (
              <NativeSelect {...aria} name="source" defaultValue={values.source} className="w-full">
                <NativeSelectOption value="ORIGINAL">Original</NativeSelectOption>
                <NativeSelectOption value="MEMORY_BASED">Memory-based</NativeSelectOption>
              </NativeSelect>
            )}
          </FormField>
        </div>
      </div>
      <CheckboxGroup
        id="topicIds"
        name="topicIds"
        legend="Topics"
        options={topics.map((t) => ({ value: t.id, label: t.name }))}
        defaultValues={values.topicIds}
        error={errors.topicIds}
        emptyText="Add topics to the DSA subject in Taxonomy first."
      />
      <CheckboxGroup
        id="languages"
        name="languages"
        legend="Languages students can use"
        options={LANGUAGE_OPTIONS}
        defaultValues={values.languages}
        error={errors.languages}
      />
      {text("statement", "Statement (Markdown)", 8)}
      <div className="grid gap-4 sm:grid-cols-3">
        {text("inputFormat", "Input format", 4)}
        {text("outputFormat", "Output format", 4)}
        {text("constraints", "Constraints", 4)}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FormField
          id="timeLimitMs"
          label="Time limit (ms)"
          error={errors.timeLimitMs}
          description="For C/C++; others get more."
        >
          {(aria) => (
            <Input
              {...aria}
              name="timeLimitMs"
              inputMode="numeric"
              defaultValue={values.timeLimitMs}
            />
          )}
        </FormField>
        <FormField id="memoryLimitMb" label="Memory (MB)" error={errors.memoryLimitMb}>
          {(aria) => (
            <Input
              {...aria}
              name="memoryLimitMb"
              inputMode="numeric"
              defaultValue={values.memoryLimitMb}
            />
          )}
        </FormField>
        <FormField id="scoring" label="Scoring" error={errors.scoring}>
          {(aria) => (
            <NativeSelect {...aria} name="scoring" defaultValue={values.scoring} className="w-full">
              <NativeSelectOption value="ALL_OR_NOTHING">All or nothing</NativeSelectOption>
              <NativeSelectOption value="PER_TEST">Marks per test</NativeSelectOption>
            </NativeSelect>
          )}
        </FormField>
        <FormField
          id="checker"
          label="Checker"
          error={errors.checker}
          description="exact, ignore_whitespace, float:1e-6"
        >
          {(aria) => (
            <Input {...aria} name="checker" defaultValue={values.checker} className="font-mono" />
          )}
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <FormField
            key={i}
            id={`hint${i + 1}`}
            label={`Hint ${i + 1}`}
            error={errors[`hint${i + 1}`]}
          >
            {(aria) => (
              <Textarea
                {...aria}
                name={`hint${i + 1}`}
                rows={3}
                defaultValue={values.hints[i] ?? ""}
              />
            )}
          </FormField>
        ))}
      </div>
      {text("editorial", "Editorial (Markdown)", 6, "Unlocks after the last hint or once solved.")}
      <p className="text-xs text-muted-foreground">
        {creating
          ? "Saved as a draft. Next, add tests and a reference solution, then check it in the judge."
          : "Saving sends a published problem back to draft. Changing limits or the checker re-runs the judge check."}
      </p>
      <Button type="submit" disabled={pending} data-testid="save-problem">
        {pending ? "Saving…" : creating ? "Create problem" : "Save changes"}
      </Button>
    </form>
  );
}

const KIND_LABELS = {
  REFERENCE: "Reference solution",
  BRUTE: "Brute-force solution",
  STARTER: "Starter code",
} as const;

/** Adds code for a new kind and language, or (with `initial`) replaces one solution's code. */
export function SolutionForm({
  problemId,
  languages,
  initial,
}: {
  problemId: string;
  /** Languages the problem allows; starter code must use one of them. */
  languages: string[];
  initial?: { kind: keyof typeof KIND_LABELS; language: string; code: string };
}) {
  const [state, onSubmit, pending] = useFormSubmit<ProblemFormState>(saveSolutionAction, {});
  const errors = state.fieldErrors ?? {};
  const prefix = initial ? `sol-${initial.kind}-${initial.language}` : "sol-new";
  return (
    <form onSubmit={onSubmit} className="space-y-3" aria-label="Solution code">
      <input type="hidden" name="problemId" value={problemId} />
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      {initial ? (
        <>
          <input type="hidden" name="kind" value={initial.kind} />
          <input type="hidden" name="language" value={initial.language} />
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField id={`${prefix}-kind`} label="Kind" error={errors.kind}>
            {(aria) => (
              <NativeSelect {...aria} name="kind" defaultValue="REFERENCE" className="w-full">
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField
            id={`${prefix}-language`}
            label="Language"
            error={errors.language}
            description="Saving the same kind and language replaces that code."
          >
            {(aria) => (
              <NativeSelect {...aria} name="language" defaultValue="" className="w-full">
                <NativeSelectOption value="" disabled>
                  Choose…
                </NativeSelectOption>
                {CODING_LANGUAGE_IDS.map((id) => (
                  <NativeSelectOption key={id} value={id}>
                    {CODING_LANGUAGES[id].label}
                    {languages.includes(id) ? "" : " (not offered to students)"}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
      )}
      <FormField
        id={`${prefix}-code`}
        label="Code"
        error={errors.code}
        description="Reads stdin and writes stdout. Java must use public class Main."
      >
        {(aria) => (
          <Textarea
            {...aria}
            name="code"
            rows={initial ? 14 : 10}
            defaultValue={initial?.code ?? ""}
            spellCheck={false}
            className="font-mono text-xs"
          />
        )}
      </FormField>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : initial ? "Save code" : "Add code"}
      </Button>
    </form>
  );
}

export function AddTestForm({ problemId }: { problemId: string }) {
  const [state, onSubmit, pending] = useFormSubmit<ProblemFormState>(addTestCaseAction, {});
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <input type="hidden" name="problemId" value={problemId} />
      {state.formError ? (
        <Alert variant="destructive">
          <AlertDescription>{state.formError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="test-input">Input</Label>
          <Textarea id="test-input" name="input" rows={4} className="font-mono text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="test-output">Expected output</Label>
          <Textarea
            id="test-output"
            name="output"
            rows={4}
            className="font-mono text-sm"
            required
          />
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="test-sample">Visible to students?</Label>
          <NativeSelect id="test-sample" name="isSample" defaultValue="no">
            <NativeSelectOption value="no">Hidden test</NativeSelectOption>
            <NativeSelectOption value="yes">Sample (shown)</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="min-w-48 flex-1 space-y-1.5">
          <Label htmlFor="test-explanation">Explanation (samples)</Label>
          <Input id="test-explanation" name="explanation" />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Adding…" : "Add test"}
        </Button>
      </div>
    </form>
  );
}
