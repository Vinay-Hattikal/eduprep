"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { saveBlueprintAction, type BlueprintFormState } from "@/app/admin/tests/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useFormSubmit } from "@/hooks/use-form-submit";
import type { BlueprintForm } from "@/schemas/blueprint";

export type EditorOptions = {
  subjects: { name: string; topics: { id: string; name: string }[] }[];
  companies: { id: string; name: string }[];
};

type Section = BlueprintForm["sections"][number];

const emptySection = (): Section => ({
  name: "New section",
  type: "MCQ",
  minutes: 20,
  marksPerItem: 1,
  negativeMarks: 0,
  canGoBack: true,
  rules: [{ topicId: "", difficulty: null, count: 5 }],
});

export const EMPTY_BLUEPRINT: BlueprintForm = {
  title: "",
  slug: "",
  kind: "TOPIC",
  platformStyle: "GENERIC",
  navigation: "FREE",
  description: null,
  instructions: null,
  companyId: null,
  sections: [emptySection()],
};

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

/** Edits a whole blueprint in the browser and sends it as one JSON document. */
export function BlueprintEditor({
  initial,
  options,
}: {
  initial: BlueprintForm;
  options: EditorOptions;
}) {
  const [value, setValue] = useState<BlueprintForm>(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.id));
  const [state, onSubmit, pending] = useFormSubmit<BlueprintFormState>(saveBlueprintAction, {});
  const set = <K extends keyof BlueprintForm>(key: K, v: BlueprintForm[K]) =>
    setValue((b) => ({ ...b, [key]: v }));
  const setSection = (index: number, patch: Partial<Section>) =>
    setValue((b) => ({
      ...b,
      sections: b.sections.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  const moveSection = (index: number, by: number) =>
    setValue((b) => {
      const sections = [...b.sections];
      const [moved] = sections.splice(index, 1);
      sections.splice(index + by, 0, moved!);
      return { ...b, sections };
    });

  const totalMinutes = value.sections.reduce((n, s) => n + (Number(s.minutes) || 0), 0);
  const totalItems = value.sections.reduce(
    (n, s) => n + s.rules.reduce((m, r) => m + (Number(r.count) || 0), 0),
    0,
  );

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="blueprint" value={JSON.stringify(value)} />
      {state.errors?.length ? (
        <Alert variant="destructive">
          <AlertTitle>Fix these before saving</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {state.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Test</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="bp-title">Title</Label>
            <Input
              id="bp-title"
              value={value.title}
              onChange={(e) => {
                set("title", e.target.value);
                if (!slugTouched) set("slug", slugify(e.target.value));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-slug">URL slug</Label>
            <Input
              id="bp-slug"
              value={value.slug}
              className="font-mono"
              onChange={(e) => {
                setSlugTouched(true);
                set("slug", e.target.value);
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-kind">Kind</Label>
            <NativeSelect
              id="bp-kind"
              className="w-full"
              value={value.kind}
              onChange={(e) => set("kind", e.target.value as BlueprintForm["kind"])}
            >
              <NativeSelectOption value="TOPIC">Topic test</NativeSelectOption>
              <NativeSelectOption value="COMPANY_MOCK">Company mock</NativeSelectOption>
              <NativeSelectOption value="OA">Coding assessment</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-company">Company</Label>
            <NativeSelect
              id="bp-company"
              className="w-full"
              value={value.companyId ?? ""}
              onChange={(e) => set("companyId", e.target.value || null)}
            >
              <NativeSelectOption value="">None</NativeSelectOption>
              {options.companies.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-style">Exam screen</Label>
            <NativeSelect
              id="bp-style"
              className="w-full"
              value={value.platformStyle}
              onChange={(e) =>
                set("platformStyle", e.target.value as BlueprintForm["platformStyle"])
              }
            >
              <NativeSelectOption value="GENERIC">Standard</NativeSelectOption>
              <NativeSelectOption value="TCS_ION">TCS iON-like layout</NativeSelectOption>
              <NativeSelectOption value="AMCAT">AMCAT-like layout</NativeSelectOption>
              <NativeSelectOption value="HACKERRANK">HackerRank-like layout</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-nav">Sections</Label>
            <NativeSelect
              id="bp-nav"
              className="w-full"
              value={value.navigation}
              onChange={(e) => set("navigation", e.target.value as BlueprintForm["navigation"])}
            >
              <NativeSelectOption value="FREE">Move freely, one timer</NativeSelectOption>
              <NativeSelectOption value="SEQUENTIAL">
                One at a time, timer per section
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bp-description">Short description</Label>
            <Input
              id="bp-description"
              value={value.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="bp-instructions">Extra instructions (Markdown, optional)</Label>
            <Textarea
              id="bp-instructions"
              rows={3}
              value={value.instructions ?? ""}
              onChange={(e) => set("instructions", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {value.sections.map((section, index) => (
        <Card key={index} data-testid="blueprint-section">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>
              <h2>Section {index + 1}</h2>
            </CardTitle>
            <div className="flex gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === 0}
                onClick={() => moveSection(index, -1)}
                aria-label="Move up"
              >
                <ArrowUp />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={index === value.sections.length - 1}
                onClick={() => moveSection(index, 1)}
                aria-label="Move down"
              >
                <ArrowDown />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={value.sections.length === 1}
                onClick={() =>
                  set(
                    "sections",
                    value.sections.filter((_, i) => i !== index),
                  )
                }
                aria-label="Remove section"
              >
                <Trash2 />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-6">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor={`s${index}-name`}>Name</Label>
                <Input
                  id={`s${index}-name`}
                  value={section.name}
                  onChange={(e) => setSection(index, { name: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`s${index}-type`}>Type</Label>
                <NativeSelect
                  id={`s${index}-type`}
                  className="w-full"
                  value={section.type}
                  onChange={(e) => setSection(index, { type: e.target.value as Section["type"] })}
                >
                  <NativeSelectOption value="MCQ">MCQ</NativeSelectOption>
                  <NativeSelectOption value="CODING">Coding</NativeSelectOption>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`s${index}-minutes`}>Minutes</Label>
                <Input
                  id={`s${index}-minutes`}
                  type="number"
                  min={1}
                  value={section.minutes}
                  onChange={(e) => setSection(index, { minutes: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`s${index}-marks`}>Marks each</Label>
                <Input
                  id={`s${index}-marks`}
                  type="number"
                  step="0.25"
                  min={0.25}
                  value={section.marksPerItem}
                  onChange={(e) => setSection(index, { marksPerItem: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`s${index}-negative`}>Minus if wrong</Label>
                <Input
                  id={`s${index}-negative`}
                  type="number"
                  step="0.25"
                  min={0}
                  value={section.negativeMarks}
                  onChange={(e) => setSection(index, { negativeMarks: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id={`s${index}-back`}
                checked={section.canGoBack}
                onCheckedChange={(v) => setSection(index, { canGoBack: v === true })}
              />
              <Label htmlFor={`s${index}-back`} className="font-normal">
                Students can go back to earlier questions in this section
              </Label>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Draw questions from</legend>
              {section.rules.map((rule, r) => (
                <div key={r} className="flex flex-wrap items-center gap-2">
                  <NativeSelect
                    aria-label="Topic"
                    className="min-w-56 flex-1"
                    value={rule.topicId}
                    onChange={(e) =>
                      setSection(index, {
                        rules: section.rules.map((x, i) =>
                          i === r ? { ...x, topicId: e.target.value } : x,
                        ),
                      })
                    }
                  >
                    <NativeSelectOption value="">Choose a topic</NativeSelectOption>
                    {options.subjects.map((subject) => (
                      <NativeSelectOptGroup key={subject.name} label={subject.name}>
                        {subject.topics.map((t) => (
                          <NativeSelectOption key={t.id} value={t.id}>
                            {t.name}
                          </NativeSelectOption>
                        ))}
                      </NativeSelectOptGroup>
                    ))}
                  </NativeSelect>
                  <NativeSelect
                    aria-label="Difficulty"
                    value={rule.difficulty ?? ""}
                    onChange={(e) =>
                      setSection(index, {
                        rules: section.rules.map((x, i) =>
                          i === r
                            ? {
                                ...x,
                                difficulty: (e.target.value ||
                                  null) as Section["rules"][number]["difficulty"],
                              }
                            : x,
                        ),
                      })
                    }
                  >
                    <NativeSelectOption value="">Any difficulty</NativeSelectOption>
                    <NativeSelectOption value="EASY">Easy</NativeSelectOption>
                    <NativeSelectOption value="MEDIUM">Medium</NativeSelectOption>
                    <NativeSelectOption value="HARD">Hard</NativeSelectOption>
                  </NativeSelect>
                  <Input
                    aria-label="How many"
                    type="number"
                    min={1}
                    className="w-20"
                    value={rule.count}
                    onChange={(e) =>
                      setSection(index, {
                        rules: section.rules.map((x, i) =>
                          i === r ? { ...x, count: Number(e.target.value) } : x,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={section.rules.length === 1}
                    onClick={() =>
                      setSection(index, { rules: section.rules.filter((_, i) => i !== r) })
                    }
                    aria-label="Remove topic"
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setSection(index, {
                    rules: [...section.rules, { topicId: "", difficulty: null, count: 5 }],
                  })
                }
              >
                <Plus /> Add topic
              </Button>
            </fieldset>
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => set("sections", [...value.sections, emptySection()])}
        >
          <Plus /> Add section
        </Button>
        <span className="text-sm text-muted-foreground">
          {totalItems} questions · {totalMinutes} minutes
        </span>
        <Button type="submit" className="ml-auto" disabled={pending} data-testid="save-blueprint">
          {pending ? "Saving…" : "Save as draft"}
        </Button>
      </div>
    </form>
  );
}
