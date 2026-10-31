"use client";

import {
  ArrowRight,
  Bookmark,
  BookmarkCheck,
  CheckCircle2,
  Clock,
  History,
  Lock,
  Minus,
  PartyPopper,
  TrendingDown,
  TrendingUp,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  nextQuestionAction,
  submitAnswerAction,
  toggleBookmarkAction,
} from "@/app/(student)/practice/actions";
import { QuestionDiscussion } from "@/components/practice/question-discussion";
import { ReportDialog } from "@/components/practice/report-dialog";
import { Markdown } from "@/components/shared/markdown";
import { DifficultyLabel } from "@/components/shared/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { codeFence, filledOptions, OPTION_LETTERS } from "@/lib/content/question-rules";
import { formatMonth } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  AnswerResult,
  PracticeFilter,
  StudentQuestion,
  Usage,
} from "@/server/services/practice";

type Answered = Extract<AnswerResult, { status: "answered" }>;

type PlayerProps = {
  initial: StudentQuestion | null;
  filter: PracticeFilter;
  mode: "PRACTICE" | "RETRY" | "DAILY";
  usage: Usage;
  /** Daily question: one question, no "next". */
  single?: boolean;
  /** Shown when the student already answered (daily question). */
  alreadyAnswered?: boolean;
  emptyHref: string;
};

function formatClock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function PracticePlayer({
  initial,
  filter,
  mode,
  usage: initialUsage,
  single,
  alreadyAnswered,
  emptyHref,
}: PlayerProps) {
  const [question, setQuestion] = useState(initial);
  const [selected, setSelected] = useState<string[]>([]);
  const [numeric, setNumeric] = useState("");
  const [result, setResult] = useState<Answered | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const [usage, setUsage] = useState(initialUsage);
  const [bookmarked, setBookmarked] = useState(initial?.bookmarked ?? false);
  const [seen, setSeen] = useState<string[]>(initial ? [initial.id] : []);
  const [session, setSession] = useState({ answered: 0, correct: 0 });
  const [finished, setFinished] = useState(false);
  const [pending, startTransition] = useTransition();
  // The clock: when this question appeared, and a "now" that ticks while it's unanswered.
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [now, setNow] = useState(startedAt);
  const elapsed = Math.max(0, Math.floor((now - startedAt) / 1000));
  const questionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!question || result) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [question, result]);

  const options = question ? filledOptions(question.options) : [];
  const canSubmit =
    !result &&
    !pending &&
    (question?.type === "NUMERIC"
      ? numeric.trim() !== "" && Number.isFinite(Number(numeric))
      : selected.length > 0);

  const toggle = useCallback(
    (letter: string) => {
      if (!question || result) return;
      if (question.type === "SINGLE") setSelected([letter]);
      else
        setSelected((s) =>
          s.includes(letter) ? s.filter((l) => l !== letter) : [...s, letter].sort(),
        );
    },
    [question, result],
  );

  const submit = useCallback(() => {
    if (!question || !canSubmit) return;
    const answeredAt = Date.now();
    const timeSec = Math.min(3600, Math.round((answeredAt - startedAt) / 1000));
    setNow(answeredAt); // freeze the clock at the answer time
    startTransition(async () => {
      const outcome = await submitAnswerAction({
        questionId: question.id,
        selectedOptions: question.type === "NUMERIC" ? [] : (selected as never),
        numericAnswer: question.type === "NUMERIC" ? Number(numeric) : null,
        timeSec,
        mode,
      });
      if (outcome.status === "limit") {
        setUsage(outcome.usage);
        setLimitReached(true);
      } else if (outcome.status === "not-found") {
        toast.error("This question is no longer available.");
      } else {
        setResult(outcome);
        setUsage(outcome.usage);
        setSession((s) => ({
          answered: s.answered + 1,
          correct: s.correct + (outcome.correct ? 1 : 0),
        }));
      }
    });
  }, [question, canSubmit, selected, numeric, mode, startedAt]);

  const next = useCallback(() => {
    if (single) return;
    startTransition(async () => {
      const upcoming = await nextQuestionAction(filter, seen);
      setResult(null);
      setSelected([]);
      setNumeric("");
      if (!upcoming) {
        setFinished(true);
        setQuestion(null);
        return;
      }
      const shownAt = Date.now();
      setStartedAt(shownAt);
      setNow(shownAt);
      setQuestion(upcoming);
      setBookmarked(upcoming.bookmarked);
      setSeen((s) => [...s, upcoming.id]);
      requestAnimationFrame(() => questionRef.current?.focus());
    });
  }, [filter, seen, single]);

  const toggleBookmark = useCallback(() => {
    if (!question) return;
    startTransition(async () => {
      const saved = await toggleBookmarkAction(question.id);
      setBookmarked(saved);
      toast.success(saved ? "Bookmarked" : "Bookmark removed");
    });
  }, [question]);

  // Keyboard: 1–5 or A–E pick options, Enter submits / goes next, B bookmarks.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      const key = event.key.toUpperCase();
      const index = /^[1-5]$/.test(key) ? Number(key) - 1 : OPTION_LETTERS.indexOf(key as never);
      if (index >= 0 && index < options.length && question?.type !== "NUMERIC" && key !== "B") {
        event.preventDefault();
        toggle(OPTION_LETTERS[index]!);
      } else if (key === "B" && question) {
        // "B" is also an option letter: use it for bookmarking only after answering.
        if (result) {
          event.preventDefault();
          toggleBookmark();
        } else if (options.length > 1 && question.type !== "NUMERIC") {
          event.preventDefault();
          toggle("B");
        }
      } else if (event.key === "Enter") {
        if (result && !single) {
          event.preventDefault();
          next();
        } else if (canSubmit) {
          event.preventDefault();
          submit();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options.length, question, result, canSubmit, single, toggle, toggleBookmark, submit, next]);

  const usageNote =
    usage.limit !== null && mode !== "DAILY" ? (
      <span className="tabular">
        {Math.min(usage.used, usage.limit)} of {usage.limit} free questions today
      </span>
    ) : null;

  if (limitReached) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <Lock className="size-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold">You&apos;ve used today&apos;s free questions</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            The free plan includes {usage.limit} questions a day; the count resets at midnight. Pro
            with unlimited practice is coming soon. Meanwhile, today&apos;s question of the day
            doesn&apos;t count.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href="/practice/daily">Question of the day</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/progress">See your progress</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!question) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
            <PartyPopper className="size-6" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold">
            {finished ? "You've finished this set" : "No questions here yet"}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {finished
              ? `You answered ${session.answered} question${session.answered === 1 ? "" : "s"} and got ${session.correct} right.`
              : "Try another topic, or come back as new questions are added."}
          </p>
          <Button asChild>
            <Link href={emptyHref}>Choose another topic</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const correctSet = new Set(result?.correctOptions ?? []);
  const slow = result ? result.expectedTimeSec * 1.5 < (elapsed || 0) : false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
        {!single ? (
          <span>
            Question {session.answered + (result ? 0 : 1)}
            {session.answered ? (
              <span className="tabular">
                {" "}
                · {session.correct}/{session.answered} correct
              </span>
            ) : null}
          </span>
        ) : null}
        <span
          className="tabular inline-flex items-center gap-1"
          aria-label={`Time ${formatClock(elapsed)}`}
        >
          <Clock className="size-4" aria-hidden="true" /> {formatClock(elapsed)}
        </span>
        <span className="ml-auto">{usageNote}</span>
      </div>

      <Card>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">
              {question.subject} › {question.topic}
            </span>
            <DifficultyLabel difficulty={question.difficulty} />
            {question.askedIn.slice(0, 2).map((item) => (
              <Badge key={item.company} variant="outline" className="max-w-full gap-1">
                <History className="size-3" aria-hidden="true" />
                <span className="truncate">
                  {item.company} · {formatMonth(item.months[0]!)}
                </span>
              </Badge>
            ))}
          </div>

          {question.passage ? (
            <details open className="rounded-lg border bg-surface">
              <summary className="cursor-pointer px-4 py-2 text-sm font-medium">
                {question.passage.title}
              </summary>
              <div className="border-t px-4 py-3">
                <Markdown className="text-sm">{question.passage.body}</Markdown>
              </div>
            </details>
          ) : null}

          <div
            ref={questionRef}
            tabIndex={-1}
            className="space-y-4 outline-none"
            aria-live="polite"
          >
            <Markdown>{question.text}</Markdown>
            {question.code ? (
              <Markdown>{codeFence(question.code, question.codeLanguage)}</Markdown>
            ) : null}
          </div>

          {question.type === "NUMERIC" ? (
            <div className="space-y-2">
              <label htmlFor="numeric-answer" className="text-sm font-medium">
                Your answer
              </label>
              <Input
                id="numeric-answer"
                inputMode="decimal"
                value={numeric}
                onChange={(e) => setNumeric(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (result ? next() : submit())}
                disabled={Boolean(result)}
                className={cn(
                  "tabular max-w-48 text-base",
                  result && (result.correct ? "border-success" : "border-destructive"),
                )}
                autoComplete="off"
              />
              {result && !result.correct ? (
                <p className="text-sm">
                  Correct answer:{" "}
                  <span className="tabular font-semibold">{result.numericAnswer}</span>
                  {result.tolerance ? (
                    <span className="text-muted-foreground"> (± {result.tolerance})</span>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : (
            <div
              role={question.type === "SINGLE" ? "radiogroup" : "group"}
              aria-label={
                question.type === "SINGLE" ? "Choose one answer" : "Choose all correct answers"
              }
              className="space-y-2"
            >
              {question.type === "MULTIPLE" ? (
                <p className="text-xs text-muted-foreground">Select all that apply.</p>
              ) : null}
              {options.map((option, index) => {
                const letter = OPTION_LETTERS[index]!;
                const isSelected = selected.includes(letter);
                const isCorrect = correctSet.has(letter);
                const state = !result
                  ? isSelected
                    ? "selected"
                    : "idle"
                  : isCorrect
                    ? "correct"
                    : isSelected
                      ? "wrong"
                      : "idle";
                return (
                  <button
                    key={letter}
                    type="button"
                    role={question.type === "SINGLE" ? "radio" : "checkbox"}
                    aria-checked={isSelected}
                    disabled={Boolean(result)}
                    onClick={() => toggle(letter)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
                      "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:cursor-default",
                      state === "idle" && "hover:border-primary/40 hover:bg-muted/50",
                      state === "selected" && "border-primary bg-secondary/60",
                      state === "correct" && "border-success bg-success/10",
                      state === "wrong" && "border-destructive bg-destructive/10",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                        state === "selected" && "border-primary bg-primary text-primary-foreground",
                        state === "correct" && "border-success bg-success text-success-foreground",
                        state === "wrong" &&
                          "border-destructive bg-destructive text-destructive-foreground",
                      )}
                      aria-hidden="true"
                    >
                      {state === "correct" ? (
                        <CheckCircle2 className="size-4" />
                      ) : state === "wrong" ? (
                        <XCircle className="size-4" />
                      ) : (
                        letter
                      )}
                    </span>
                    <Markdown className="min-w-0 flex-1 text-base">{option}</Markdown>
                    {state === "correct" ? <span className="sr-only">Correct answer</span> : null}
                    {state === "wrong" ? (
                      <span className="sr-only">Your answer, incorrect</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}

          {result ? (
            <div className="space-y-4" role="status">
              <div
                className={cn(
                  "flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-3",
                  result.correct ? "bg-success/10" : "bg-destructive/10",
                )}
              >
                <span
                  className={cn(
                    "flex items-center gap-2 font-semibold",
                    result.correct ? "text-success" : "text-destructive",
                  )}
                >
                  {result.correct ? (
                    <CheckCircle2 className="size-5" aria-hidden="true" />
                  ) : (
                    <XCircle className="size-5" aria-hidden="true" />
                  )}
                  {result.correct ? "Correct" : "Not quite"}
                </span>
                <span className="tabular text-sm text-muted-foreground">
                  {formatClock(elapsed)} · target {formatClock(result.expectedTimeSec)}
                  {slow ? " · try to speed up" : ""}
                </span>
                <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground">
                  {result.mastery.after > result.mastery.before ? (
                    <TrendingUp className="size-4 text-success" aria-hidden="true" />
                  ) : result.mastery.after < result.mastery.before ? (
                    <TrendingDown className="size-4 text-warning" aria-hidden="true" />
                  ) : (
                    <Minus className="size-4" aria-hidden="true" />
                  )}
                  {result.mastery.topic}:{" "}
                  <span className="tabular">
                    {result.mastery.before}% → {result.mastery.after}%
                  </span>
                </span>
              </div>
              <div className="space-y-2 rounded-xl bg-secondary/40 p-4">
                <p className="text-sm font-medium">Explanation</p>
                <Markdown className="text-base">{result.explanation}</Markdown>
              </div>
              <QuestionDiscussion key={question.id} questionId={question.id} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            {!result ? (
              <Button onClick={submit} disabled={!canSubmit} data-testid="check-answer">
                {pending ? "Checking…" : "Check answer"}
              </Button>
            ) : single ? (
              <Button asChild>
                <Link href="/practice">
                  Keep practising <ArrowRight data-icon="inline-end" />
                </Link>
              </Button>
            ) : (
              <Button onClick={next} disabled={pending} data-testid="next-question">
                Next question <ArrowRight data-icon="inline-end" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleBookmark}
              aria-pressed={bookmarked}
              data-testid="bookmark"
            >
              {bookmarked ? <BookmarkCheck /> : <Bookmark />}
              {bookmarked ? "Bookmarked" : "Bookmark"}
            </Button>
            <ReportDialog questionId={question.id} />
            <span className="ml-auto hidden text-xs text-muted-foreground lg:inline">
              Keys: 1–5 choose · Enter {result ? "next" : "check"}
            </span>
          </div>
        </CardContent>
      </Card>

      {alreadyAnswered && !result ? (
        <p className="text-sm text-muted-foreground">
          You already answered today&apos;s question. Answering again won&apos;t change your streak.
        </p>
      ) : null}
    </div>
  );
}
