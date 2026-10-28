"use client";

import { Markdown } from "@/components/shared/markdown";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OPTION_LETTERS } from "@/lib/content/question-rules";
import { cn } from "@/lib/utils";

export type ExamQuestion = {
  type: "SINGLE" | "MULTIPLE" | "NUMERIC";
  text: string;
  code: string | null;
  codeLanguage: string | null;
  options: string[];
  passage: { title: string; body: string } | null;
};

/** One MCQ inside a test: no feedback, just the answer controls. */
export function McqView({
  number,
  question,
  selected,
  numeric,
  onSelect,
  onNumeric,
  disabled,
}: {
  number: number;
  question: ExamQuestion;
  selected: string[];
  numeric: number | null;
  onSelect: (options: string[]) => void;
  onNumeric: (value: number | null) => void;
  disabled?: boolean;
}) {
  const multiple = question.type === "MULTIPLE";
  const toggle = (letter: string) => {
    if (multiple)
      onSelect(
        selected.includes(letter)
          ? selected.filter((o) => o !== letter)
          : [...selected, letter].sort(),
      );
    else onSelect([letter]);
  };

  return (
    <div className="space-y-5">
      {question.passage ? (
        <details className="rounded-lg border bg-surface p-4" open>
          <summary className="cursor-pointer font-medium">{question.passage.title}</summary>
          <Markdown className="mt-3 text-base">{question.passage.body}</Markdown>
        </details>
      ) : null}
      <div className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">
          Question {number}
          {multiple
            ? " · Select all that apply"
            : question.type === "NUMERIC"
              ? " · Type a number"
              : ""}
        </p>
        <Markdown>{question.text}</Markdown>
        {question.code ? (
          <Markdown>{`\`\`\`${question.codeLanguage ?? ""}\n${question.code}\n\`\`\``}</Markdown>
        ) : null}
      </div>

      {question.type === "NUMERIC" ? (
        <div className="max-w-xs space-y-1.5">
          <Label htmlFor="numeric-answer">Your answer</Label>
          <Input
            id="numeric-answer"
            inputMode="decimal"
            disabled={disabled}
            defaultValue={numeric ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim();
              const value = Number(raw);
              onNumeric(raw === "" || !Number.isFinite(value) ? null : value);
            }}
          />
        </div>
      ) : (
        <div role={multiple ? "group" : "radiogroup"} aria-label="Options" className="space-y-2">
          {question.options.map((option, index) => {
            const letter = OPTION_LETTERS[index]!;
            const checked = selected.includes(letter);
            return (
              <button
                key={letter}
                type="button"
                role={multiple ? "checkbox" : "radio"}
                aria-checked={checked}
                disabled={disabled}
                onClick={() => toggle(letter)}
                data-testid={`option-${letter}`}
                className={cn(
                  "flex w-full min-w-0 items-start gap-3 rounded-lg border p-3 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
                  checked ? "border-primary bg-primary/5" : "hover:bg-secondary/40",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center border text-sm font-semibold",
                    multiple ? "rounded-md" : "rounded-full",
                    checked ? "border-primary bg-primary text-primary-foreground" : "bg-card",
                  )}
                  aria-hidden="true"
                >
                  {letter}
                </span>
                <span className="min-w-0 flex-1 pt-0.5">
                  <Markdown className="text-base">{option}</Markdown>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
