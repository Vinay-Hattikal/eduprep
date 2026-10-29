import { Check } from "lucide-react";
import { Markdown } from "@/components/shared/markdown";
import { codeFence, filledOptions, OPTION_LETTERS } from "@/lib/content/question-rules";
import { cn } from "@/lib/utils";

export type PreviewQuestion = {
  type: "SINGLE" | "MULTIPLE" | "NUMERIC";
  text: string;
  code: string | null;
  codeLanguage: string | null;
  options: string[];
  correctOptions: string[];
  numericAnswer: number | null;
  tolerance: number | null;
  explanation: string;
  passage?: { title: string; body: string } | null;
};

/** How a question looks to a student, with the answer shown (admin preview). */
export function QuestionPreview({ question }: { question: PreviewQuestion }) {
  const options = filledOptions(question.options);

  return (
    <div className="space-y-4">
      {question.passage ? (
        <div className="rounded-lg border bg-surface p-4">
          <Markdown className="text-sm">{question.passage.body}</Markdown>
        </div>
      ) : null}

      {question.text.trim() ? (
        <Markdown>{question.text}</Markdown>
      ) : (
        <p className="text-sm text-muted-foreground italic">The question text appears here.</p>
      )}

      {question.code ? (
        <Markdown>{codeFence(question.code, question.codeLanguage)}</Markdown>
      ) : null}

      {question.type === "NUMERIC" ? (
        <div className="rounded-lg border border-success/40 bg-success/5 px-4 py-3 text-sm">
          <span className="text-muted-foreground">Answer: </span>
          <span className="tabular font-semibold">{question.numericAnswer ?? "—"}</span>
          {question.tolerance ? (
            <span className="text-muted-foreground"> (± {question.tolerance})</span>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-2" aria-label="Options">
          {options.map((option, index) => {
            const letter = OPTION_LETTERS[index]!;
            const correct = question.correctOptions.includes(letter);
            return (
              <li
                key={letter}
                className={cn(
                  "flex items-start gap-3 rounded-lg border px-3 py-2.5",
                  correct && "border-success/50 bg-success/5",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    correct && "border-success bg-success text-success-foreground",
                  )}
                >
                  {correct ? <Check className="size-3.5" aria-label="Correct" /> : letter}
                </span>
                <Markdown className="min-w-0 flex-1 text-base">{option || "—"}</Markdown>
              </li>
            );
          })}
          {question.type === "MULTIPLE" ? (
            <li className="text-xs text-muted-foreground">More than one option can be correct.</li>
          ) : null}
        </ul>
      )}

      <div className="space-y-2 rounded-lg bg-secondary/50 p-4">
        <p className="text-sm font-medium">Explanation</p>
        {question.explanation.trim() ? (
          <Markdown className="text-base">{question.explanation}</Markdown>
        ) : (
          <p className="text-sm text-muted-foreground italic">No explanation yet.</p>
        )}
      </div>
    </div>
  );
}
