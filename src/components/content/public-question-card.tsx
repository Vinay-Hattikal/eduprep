import Link from "next/link";
import { CheckCircle2, Lock } from "lucide-react";
import { Markdown } from "@/components/shared/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { codeFence, OPTION_LETTERS } from "@/lib/content/question-rules";
import type { PublicQuestion } from "@/lib/content/public-question";
import { DIFFICULTY_LABELS } from "@/lib/content/workflow";
import { cn } from "@/lib/utils";

/**
 * A question on a public page (D-058). Samples show the answer and explanation behind "Show
 * answer"; the rest invite the visitor to sign up. Search engines see exactly the same.
 */
export function PublicQuestionCard({
  question,
  number,
  practiceHref,
  titleHref,
  headingLevel = "h2",
}: {
  question: PublicQuestion & { passage?: { title: string; body: string } | null };
  number?: number;
  practiceHref: string;
  /** Link the question number to its own page (topic lists). */
  titleHref?: string;
  headingLevel?: "h1" | "h2" | "h3";
}) {
  const Heading = headingLevel;
  const answer = question.answer;
  const label = number ? `Question ${number}` : `Question ${question.externalId}`;
  return (
    <article
      className="space-y-4 rounded-xl border bg-card p-4 sm:p-6"
      data-testid="public-question"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Heading className="text-sm font-semibold">
          {titleHref ? (
            <Link href={titleHref} className="text-primary hover:underline">
              {label}
            </Link>
          ) : (
            label
          )}
        </Heading>
        <Badge variant="outline">{DIFFICULTY_LABELS[question.difficulty]}</Badge>
        {question.type === "MULTIPLE" ? (
          <Badge variant="secondary">More than one answer</Badge>
        ) : null}
      </div>

      {question.passage ? (
        <details className="rounded-lg border bg-surface p-4 text-sm">
          <summary className="cursor-pointer font-medium">{question.passage.title}</summary>
          <Markdown className="mt-3 text-sm">{question.passage.body}</Markdown>
        </details>
      ) : null}

      <Markdown>{question.text}</Markdown>
      {question.code ? (
        <Markdown>{codeFence(question.code, question.codeLanguage)}</Markdown>
      ) : null}

      {question.type !== "NUMERIC" ? (
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Options">
          {question.options.map((option, i) => (
            <li key={OPTION_LETTERS[i]} className="flex gap-3 rounded-lg border px-3 py-2">
              <span className="font-mono text-sm font-semibold text-muted-foreground">
                {OPTION_LETTERS[i]}.
              </span>
              <Markdown className="min-w-0 text-[0.95rem]">{option}</Markdown>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-muted-foreground">Enter a number as the answer.</p>
      )}

      {answer ? (
        <details className="group rounded-lg border border-success/30 bg-success/5">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-success">
            Show answer and explanation
          </summary>
          <div className="space-y-3 border-t border-success/20 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              Answer:{" "}
              {question.type === "NUMERIC"
                ? `${answer.numericAnswer}${answer.tolerance ? ` (±${answer.tolerance})` : ""}`
                : answer.correctOptions.join(", ")}
            </p>
            <Markdown className="text-[0.95rem]">{answer.explanation}</Markdown>
          </div>
        </details>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-3 rounded-lg border border-dashed px-4 py-3 sm:flex-row sm:items-center",
          )}
        >
          <p className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4 shrink-0" aria-hidden="true" />
            Sign up free to see the answer and a step-by-step explanation.
          </p>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <Link href="/sign-up">Sign up free</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={practiceHref}>Practise</Link>
            </Button>
          </div>
        </div>
      )}
    </article>
  );
}
