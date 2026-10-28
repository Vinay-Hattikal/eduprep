"use client";

import dynamic from "next/dynamic";
import { Play, RotateCcw, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { SubmissionResult, type ResultView } from "@/components/coding/submission-result";
import { useJudge, type SubmitOutcome } from "@/components/coding/use-judge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { JAVA_CLASS_NOTE, type CodingLanguage } from "@/lib/coding/languages";

// The editor is client-only and fairly large: load it after the page.
const CodeEditor = dynamic(
  () => import("@/components/coding/code-editor").then((m) => m.CodeEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-[420px] w-full rounded-lg" />,
  },
);

export type PanelLanguage = { id: CodingLanguage; label: string; timeLimitMs: number };

type Draft = { language: CodingLanguage; code: Partial<Record<CodingLanguage, string>> };

function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: Draft) {
  try {
    window.localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // private mode or storage full: drafts are a convenience only
  }
}

/** Language picker, editor, custom input, Run / Submit and the verdict. */
export function CodePanel({
  languages,
  starters,
  draftKey,
  initial,
  submit,
  poll,
  onDone,
  disabled,
  disabledReason,
  editorHeight,
}: {
  languages: PanelLanguage[];
  starters: Partial<Record<CodingLanguage, string>>;
  /** localStorage key for the student's unsaved code. */
  draftKey: string;
  /** Code to start from (e.g. the last submission in a test) when there's no draft. */
  initial?: { language: string; code: string } | null;
  submit: (input: {
    kind: "RUN" | "SUBMIT";
    language: CodingLanguage;
    code: string;
    customInput: string | null;
  }) => Promise<SubmitOutcome>;
  poll: (id: string) => Promise<ResultView | null>;
  onDone?: (result: ResultView) => void;
  disabled?: boolean;
  disabledReason?: string;
  editorHeight?: string;
}) {
  const first = languages.find((l) => l.id === initial?.language)?.id ?? languages[0]?.id ?? "cpp";
  const [language, setLanguage] = useState<CodingLanguage>(first);
  const [code, setCode] = useState<Partial<Record<CodingLanguage, string>>>(
    initial && languages.some((l) => l.id === initial.language)
      ? { [initial.language]: initial.code }
      : {},
  );
  const [useCustom, setUseCustom] = useState(false);
  const [customInput, setCustomInput] = useState("");

  // Restore a saved draft after hydration (localStorage isn't available on the server).
  useEffect(() => {
    const draft = readDraft(draftKey);
    if (!draft) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage
    if (languages.some((l) => l.id === draft.language)) setLanguage(draft.language);
    setCode((current) => ({ ...current, ...draft.code }));
  }, [draftKey, languages]);

  const current = code[language] ?? starters[language] ?? "";
  const setCurrent = (value: string) => {
    const next = { ...code, [language]: value };
    setCode(next);
    writeDraft(draftKey, { language, code: next });
  };
  const changeLanguage = (value: CodingLanguage) => {
    setLanguage(value);
    writeDraft(draftKey, { language: value, code });
  };

  const { result, error, busy, start } = useJudge({
    submit: (kind) =>
      submit({
        kind,
        language,
        code: current,
        customInput: kind === "RUN" && useCustom ? customInput : null,
      }),
    poll,
    onDone,
  });
  const selected = languages.find((l) => l.id === language);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Label htmlFor="language" className="sr-only">
            Language
          </Label>
          <NativeSelect
            id="language"
            value={language}
            onChange={(e) => changeLanguage(e.target.value as CodingLanguage)}
            data-testid="language-select"
          >
            {languages.map((l) => (
              <NativeSelectOption key={l.id} value={l.id}>
                {l.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {selected ? (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Time limit {(selected.timeLimitMs / 1000).toFixed(1)} s
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (window.confirm("Replace your code with the starter code?"))
              setCurrent(starters[language] ?? "");
          }}
        >
          <RotateCcw aria-hidden="true" /> Reset
        </Button>
      </div>
      {language === "java" ? (
        <p className="text-xs text-muted-foreground">{JAVA_CLASS_NOTE}</p>
      ) : null}

      <CodeEditor
        value={current}
        onChange={setCurrent}
        language={language}
        label={`${selected?.label ?? ""} code`}
        height={editorHeight}
      />

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="custom-input"
            checked={useCustom}
            onCheckedChange={(v) => setUseCustom(v === true)}
          />
          <Label htmlFor="custom-input" className="text-sm font-normal">
            Run with my own input
          </Label>
        </div>
        {useCustom ? (
          <textarea
            aria-label="Custom input"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            rows={4}
            spellCheck={false}
            className="w-full rounded-lg border border-input bg-transparent p-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        ) : null}
      </div>

      {disabled && disabledReason ? (
        <Alert>
          <AlertDescription>{disabledReason}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => start("RUN")}
          disabled={busy || disabled}
          data-testid="run-code"
        >
          <Play aria-hidden="true" /> Run
        </Button>
        <Button
          type="button"
          onClick={() => start("SUBMIT")}
          disabled={busy || disabled}
          data-testid="submit-code"
        >
          <Send aria-hidden="true" /> Submit
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {result ? <SubmissionResult result={result} /> : null}
    </div>
  );
}
