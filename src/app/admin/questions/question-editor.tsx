"use client";

import { Save, Send } from "lucide-react";
import { useState } from "react";
import { useFormSubmit } from "@/hooks/use-form-submit";
import { saveQuestionAction, type QuestionFormState } from "@/app/admin/questions/actions";
import { QuestionPreview } from "@/components/content/question-preview";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { AskedAtField } from "@/components/content/asked-at-field";
import { QuickPassage } from "@/components/content/quick-passage";
import { QuickTopic } from "@/components/content/quick-topic";
import type { AskedAtInput } from "@/lib/content/asked-at";
import { CODE_LANGUAGES, OPTION_LETTERS } from "@/lib/content/question-rules";

export type TaxonomyOption = {
  id: string;
  name: string;
  topics: { id: string; name: string; subtopics: { id: string; name: string }[] }[];
};

export type EditorValues = {
  id?: string;
  externalId: string;
  subjectId: string;
  topicId: string;
  subtopicId: string;
  type: "SINGLE" | "MULTIPLE" | "NUMERIC";
  text: string;
  code: string;
  codeLanguage: string;
  options: string[];
  correctOptions: string[];
  numericAnswer: string;
  tolerance: string;
  explanation: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  expectedTimeSec: string;
  passageExternalId: string;
  tags: string;
  source: "ORIGINAL" | "MEMORY_BASED";
};

const initialState: QuestionFormState = {};

type Props = {
  taxonomy: TaxonomyOption[];
  initial: EditorValues;
  passage?: { title: string; body: string } | null;
  readOnly?: boolean;
  /** Companies for the "Asked at" picker, and the question's current links. */
  companies: { id: string; name: string }[];
  initialCompanies: AskedAtInput[];
  /** New questions: start the next one after saving (company-wise entry, D-057). */
  addAnother?: boolean;
  /** Existing questions: shown without sign-in on public pages (D-058). */
  publicSample?: boolean;
};

export function QuestionEditor({
  taxonomy,
  initial,
  passage,
  readOnly = false,
  companies,
  initialCompanies,
  addAnother = false,
  publicSample,
}: Props) {
  const [state, onSubmit, pending] = useFormSubmit(saveQuestionAction, initialState);
  const [v, setV] = useState(initial);
  // Topics added with "+ New topic", per subject id (D-057).
  const [addedTopics, setAddedTopics] = useState<Record<string, TaxonomyOption["topics"]>>({});
  const errors = state.fieldErrors ?? {};
  const set = <K extends keyof EditorValues>(key: K, value: EditorValues[K]) =>
    setV((prev) => ({ ...prev, [key]: value }));

  const baseSubject = taxonomy.find((s) => s.id === v.subjectId);
  const subject = baseSubject && {
    ...baseSubject,
    topics: [...baseSubject.topics, ...(addedTopics[baseSubject.id] ?? [])],
  };
  const topic = subject?.topics.find((t) => t.id === v.topicId);
  const isNumeric = v.type === "NUMERIC";

  const toggleCorrect = (letter: string, checked: boolean) => {
    if (v.type === "SINGLE") set("correctOptions", checked ? [letter] : []);
    else
      set(
        "correctOptions",
        checked
          ? [...v.correctOptions, letter].sort()
          : v.correctOptions.filter((l) => l !== letter),
      );
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <form onSubmit={onSubmit} className="space-y-6" aria-label="Question editor">
        {v.id ? <input type="hidden" name="id" value={v.id} /> : null}
        {state.formError ? (
          <Alert variant="destructive">
            <AlertDescription>{state.formError}</AlertDescription>
          </Alert>
        ) : null}

        <fieldset disabled={readOnly || pending} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Classification</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <FormField
                id="externalId"
                label="Question ID"
                error={errors.externalId}
                description={v.id ? "IDs are permanent." : "e.g. QA-PCT-0042"}
              >
                {(aria) => (
                  <Input
                    {...aria}
                    name="externalId"
                    value={v.externalId}
                    readOnly={Boolean(v.id)}
                    onChange={(e) => set("externalId", e.target.value)}
                    className="font-mono"
                    required
                  />
                )}
              </FormField>
              <FormField id="type" label="Type" error={errors.type}>
                {(aria) => (
                  <NativeSelect
                    {...aria}
                    name="type"
                    value={v.type}
                    className="w-full"
                    onChange={(e) => set("type", e.target.value as EditorValues["type"])}
                  >
                    <NativeSelectOption value="SINGLE">Single answer</NativeSelectOption>
                    <NativeSelectOption value="MULTIPLE">Multiple answers</NativeSelectOption>
                    <NativeSelectOption value="NUMERIC">Numeric answer</NativeSelectOption>
                  </NativeSelect>
                )}
              </FormField>
              <FormField id="subjectId" label="Subject" error={errors.subjectId}>
                {(aria) => (
                  <NativeSelect
                    {...aria}
                    name="subjectId"
                    value={v.subjectId}
                    className="w-full"
                    onChange={(e) =>
                      setV((p) => ({
                        ...p,
                        subjectId: e.target.value,
                        topicId: "",
                        subtopicId: "",
                      }))
                    }
                    required
                  >
                    <NativeSelectOption value="">Choose…</NativeSelectOption>
                    {taxonomy.map((s) => (
                      <NativeSelectOption key={s.id} value={s.id}>
                        {s.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <FormField id="topicId" label="Topic" error={errors.topicId}>
                {(aria) => (
                  <NativeSelect
                    {...aria}
                    name="topicId"
                    value={v.topicId}
                    className="w-full"
                    onChange={(e) =>
                      setV((p) => ({ ...p, topicId: e.target.value, subtopicId: "" }))
                    }
                    required
                  >
                    <NativeSelectOption value="">Choose…</NativeSelectOption>
                    {subject?.topics.map((t) => (
                      <NativeSelectOption key={t.id} value={t.id}>
                        {t.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              {readOnly ? null : (
                <div className="-mt-2 sm:col-span-2">
                  <QuickTopic
                    subject={v.subjectId}
                    onCreated={(topic) => {
                      setAddedTopics((prev) => ({
                        ...prev,
                        [v.subjectId]: [...(prev[v.subjectId] ?? []), { ...topic, subtopics: [] }],
                      }));
                      setV((p) => ({ ...p, topicId: topic.id, subtopicId: "" }));
                    }}
                  />
                </div>
              )}
              <FormField id="subtopicId" label="Subtopic (optional)" error={errors.subtopicId}>
                {(aria) => (
                  <NativeSelect
                    {...aria}
                    name="subtopicId"
                    value={v.subtopicId}
                    className="w-full"
                    onChange={(e) => set("subtopicId", e.target.value)}
                    disabled={!topic?.subtopics.length}
                  >
                    <NativeSelectOption value="">None</NativeSelectOption>
                    {topic?.subtopics.map((s) => (
                      <NativeSelectOption key={s.id} value={s.id}>
                        {s.name}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                )}
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField id="difficulty" label="Difficulty" error={errors.difficulty}>
                  {(aria) => (
                    <NativeSelect
                      {...aria}
                      name="difficulty"
                      value={v.difficulty}
                      className="w-full"
                      onChange={(e) =>
                        set("difficulty", e.target.value as EditorValues["difficulty"])
                      }
                    >
                      <NativeSelectOption value="EASY">Easy</NativeSelectOption>
                      <NativeSelectOption value="MEDIUM">Medium</NativeSelectOption>
                      <NativeSelectOption value="HARD">Hard</NativeSelectOption>
                    </NativeSelect>
                  )}
                </FormField>
                <FormField id="expectedTimeSec" label="Time (sec)" error={errors.expectedTimeSec}>
                  {(aria) => (
                    <Input
                      {...aria}
                      name="expectedTimeSec"
                      inputMode="numeric"
                      value={v.expectedTimeSec}
                      onChange={(e) => set("expectedTimeSec", e.target.value)}
                      className="tabular"
                      required
                    />
                  )}
                </FormField>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Question</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                id="text"
                label="Question text"
                error={errors.text}
                description="Markdown. Maths with $...$, e.g. $\frac{a}{b}$."
              >
                {(aria) => (
                  <Textarea
                    {...aria}
                    name="text"
                    rows={5}
                    value={v.text}
                    onChange={(e) => set("text", e.target.value)}
                  />
                )}
              </FormField>
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <FormField id="code" label="Code snippet (optional)" error={errors.code}>
                  {(aria) => (
                    <Textarea
                      {...aria}
                      name="code"
                      rows={4}
                      value={v.code}
                      onChange={(e) => set("code", e.target.value)}
                      className="font-mono text-sm"
                      spellCheck={false}
                    />
                  )}
                </FormField>
                <FormField id="codeLanguage" label="Language" error={errors.codeLanguage}>
                  {(aria) => (
                    <NativeSelect
                      {...aria}
                      name="codeLanguage"
                      value={v.codeLanguage}
                      className="w-full"
                      onChange={(e) => set("codeLanguage", e.target.value)}
                    >
                      <NativeSelectOption value="">None</NativeSelectOption>
                      {CODE_LANGUAGES.map((l) => (
                        <NativeSelectOption key={l} value={l}>
                          {l}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  )}
                </FormField>
              </div>
              <FormField
                id="passageExternalId"
                label="Passage ID (optional)"
                error={errors.passageExternalId}
                description="For reading comprehension or data interpretation sets."
              >
                {(aria) => (
                  <Input
                    {...aria}
                    name="passageExternalId"
                    value={v.passageExternalId}
                    onChange={(e) => set("passageExternalId", e.target.value)}
                    className="font-mono"
                  />
                )}
              </FormField>
              {readOnly ? null : <QuickPassage onCreated={(id) => set("passageExternalId", id)} />}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{isNumeric ? "Answer" : "Options"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isNumeric ? (
                <div className="grid grid-cols-2 gap-4">
                  <FormField id="numericAnswer" label="Correct answer" error={errors.numericAnswer}>
                    {(aria) => (
                      <Input
                        {...aria}
                        name="numericAnswer"
                        inputMode="decimal"
                        value={v.numericAnswer}
                        onChange={(e) => set("numericAnswer", e.target.value)}
                        className="tabular"
                      />
                    )}
                  </FormField>
                  <FormField
                    id="tolerance"
                    label="Tolerance (±)"
                    error={errors.tolerance}
                    description="0 for exact answers."
                  >
                    {(aria) => (
                      <Input
                        {...aria}
                        name="tolerance"
                        inputMode="decimal"
                        value={v.tolerance}
                        onChange={(e) => set("tolerance", e.target.value)}
                        className="tabular"
                      />
                    )}
                  </FormField>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    Fill options in order and tick the correct{" "}
                    {v.type === "SINGLE" ? "one" : "ones"}.
                  </p>
                  {OPTION_LETTERS.map((letter, index) => (
                    <div key={letter} className="flex items-start gap-3">
                      <div className="flex h-9 items-center gap-2">
                        <Checkbox
                          id={`correct-${letter}`}
                          name="correct"
                          value={letter}
                          checked={v.correctOptions.includes(letter)}
                          onCheckedChange={(checked) => toggleCorrect(letter, checked === true)}
                          aria-label={`Option ${letter} is correct`}
                        />
                        <Label htmlFor={`correct-${letter}`} className="w-4 font-mono">
                          {letter}
                        </Label>
                      </div>
                      <Input
                        name={`option_${letter}`}
                        aria-label={`Option ${letter}`}
                        value={v.options[index] ?? ""}
                        onChange={(e) =>
                          set(
                            "options",
                            v.options.map((o, i) => (i === index ? e.target.value : o)),
                          )
                        }
                      />
                    </div>
                  ))}
                  {errors.options || errors.correctOptions ? (
                    <p className="text-xs font-medium text-destructive">
                      {errors.options ?? errors.correctOptions}
                    </p>
                  ) : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Explanation and source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                id="explanation"
                label="Explanation"
                error={errors.explanation}
                description="Explain the method, not just the answer."
              >
                {(aria) => (
                  <Textarea
                    {...aria}
                    name="explanation"
                    rows={5}
                    value={v.explanation}
                    onChange={(e) => set("explanation", e.target.value)}
                  />
                )}
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="tags" label="Tags (optional)" description="Separate with commas.">
                  {(aria) => (
                    <Input
                      {...aria}
                      name="tags"
                      value={v.tags}
                      onChange={(e) => set("tags", e.target.value)}
                    />
                  )}
                </FormField>
                <FormField id="source" label="Source" error={errors.source}>
                  {(aria) => (
                    <NativeSelect
                      {...aria}
                      name="source"
                      value={v.source}
                      className="w-full"
                      onChange={(e) => set("source", e.target.value as EditorValues["source"])}
                    >
                      <NativeSelectOption value="ORIGINAL">Original</NativeSelectOption>
                      <NativeSelectOption value="MEMORY_BASED">
                        Memory-based (rewritten)
                      </NativeSelectOption>
                    </NativeSelect>
                  )}
                </FormField>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Companies</CardTitle>
            </CardHeader>
            <CardContent>
              <AskedAtField
                companies={companies}
                initial={initialCompanies}
                error={errors.companies}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Public pages</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {v.id ? (
                <>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="publicSample"
                      name="publicSample"
                      defaultChecked={publicSample}
                      data-testid="public-sample"
                    />
                    <Label htmlFor="publicSample" className="font-normal">
                      Public sample: show the answer and explanation without sign-in
                    </Label>
                  </div>
                </>
              ) : null}
              <p className="text-xs text-muted-foreground">
                Every published question&apos;s text is public, so search engines can find it. Only
                public samples show the answer; the rest ask visitors to sign up.
                {v.id
                  ? ""
                  : " New questions become samples automatically when published, until their topic has enough (Settings)."}
              </p>
            </CardContent>
          </Card>
        </fieldset>

        {readOnly ? null : (
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
            <Button
              type="submit"
              name="intent"
              value="publish"
              disabled={pending}
              data-testid="save-publish-question"
            >
              <Send /> {pending ? "Saving…" : "Save and publish"}
            </Button>
            <Button
              type="submit"
              name="intent"
              value="draft"
              variant="outline"
              disabled={pending}
              data-testid="save-question"
            >
              <Save /> Save as draft
            </Button>
            {v.id ? null : (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="next"
                  name="next"
                  defaultChecked={addAnother}
                  data-testid="add-another"
                />
                <Label htmlFor="next" className="font-normal">
                  Then add another
                </Label>
              </div>
            )}
            <p className="w-full text-xs text-muted-foreground">
              Drafts are hidden from students. Saving a published question as a draft unpublishes
              it.
            </p>
          </div>
        )}
      </form>

      <div className="xl:sticky xl:top-24 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle>Student preview</CardTitle>
          </CardHeader>
          <CardContent>
            <QuestionPreview
              question={{
                type: v.type,
                text: v.text,
                code: v.code || null,
                codeLanguage: v.codeLanguage || null,
                options: isNumeric ? [] : v.options,
                correctOptions: v.correctOptions,
                numericAnswer: v.numericAnswer.trim() ? Number(v.numericAnswer) : null,
                tolerance: v.tolerance.trim() ? Number(v.tolerance) : null,
                explanation: v.explanation,
                passage,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
