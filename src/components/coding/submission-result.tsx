"use client";

import { CheckCircle2, Clock3, Loader2, Lock, XCircle } from "lucide-react";
import { VerdictBadge } from "@/components/shared/status-badge";
import type { VerdictName } from "@/lib/coding/languages";
import { cn } from "@/lib/utils";

export type ResultTest = {
  index: number;
  sample: boolean;
  verdict: VerdictName;
  timeMs: number;
  input?: string;
  expected?: string;
  output?: string;
  stderr?: string;
};

export type ResultView = {
  kind: "RUN" | "SUBMIT";
  verdict: VerdictName;
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number | null;
  compileOutput: string | null;
  results: ResultTest[];
  custom: boolean;
  done: boolean;
};

function Block({ label, text, tone }: { label: string; text: string; tone?: "error" }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <pre
        className={cn(
          "max-h-48 overflow-auto rounded-md border bg-muted/50 p-2 font-mono text-xs break-words whitespace-pre-wrap",
          tone === "error" && "border-destructive/30 text-destructive",
        )}
      >
        {text || <span className="text-muted-foreground italic">(empty)</span>}
      </pre>
    </div>
  );
}

/** Verdict and per-test results of a run or submission. Hidden tests show only their verdict. */
export function SubmissionResult({ result }: { result: ResultView }) {
  if (!result.done) {
    return (
      <div
        className="flex items-center gap-2 rounded-lg border bg-card p-4 text-sm"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="size-4 animate-spin text-info" aria-hidden="true" />
        {result.verdict === "PENDING" ? "Waiting for the judge…" : "Running your code…"}
      </div>
    );
  }

  const heading =
    result.kind === "RUN" && result.custom
      ? result.verdict === "ACCEPTED"
        ? "Ran successfully"
        : undefined
      : result.kind === "RUN" && result.verdict === "ACCEPTED"
        ? "Sample tests passed"
        : undefined;

  return (
    <div
      className="space-y-3 rounded-lg border bg-card p-4"
      role="status"
      aria-live="polite"
      data-testid="submission-result"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <VerdictBadge verdict={result.verdict} label={heading} />
        {result.verdict !== "COMPILATION_ERROR" && !result.custom ? (
          <span className="text-sm text-muted-foreground">
            {result.testsPassed}/{result.testsTotal} tests passed
          </span>
        ) : null}
        {result.runtimeMs !== null ? (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <Clock3 className="size-3.5" aria-hidden="true" /> {result.runtimeMs} ms
          </span>
        ) : null}
      </div>

      {result.compileOutput ? (
        <Block label="Compiler output" text={result.compileOutput} tone="error" />
      ) : null}

      {result.results.length ? (
        <ol className="space-y-2">
          {result.results.map((test) => {
            const passed = test.verdict === "ACCEPTED";
            const visible = test.input !== undefined;
            return (
              <li key={test.index} className="rounded-md border p-2">
                <details
                  open={
                    visible &&
                    !passed &&
                    result.results.filter((t) => t.input !== undefined).length <= 3
                  }
                >
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm">
                    {passed ? (
                      <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                    ) : (
                      <XCircle className="size-4 text-destructive" aria-hidden="true" />
                    )}
                    <span className="font-medium">
                      {result.custom
                        ? "Custom input"
                        : `${test.sample ? "Sample" : "Hidden"} test ${test.index + 1}`}
                    </span>
                    <span className="text-muted-foreground">· {test.timeMs} ms</span>
                    {!visible ? (
                      <Lock
                        className="ml-auto size-3.5 text-muted-foreground"
                        aria-label="Hidden test"
                      />
                    ) : null}
                    {!passed ? <span className="sr-only">{test.verdict}</span> : null}
                  </summary>
                  {visible ? (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <Block label="Input" text={test.input ?? ""} />
                      {test.expected !== undefined ? (
                        <Block label="Expected output" text={test.expected} />
                      ) : null}
                      <Block label="Your output" text={test.output ?? ""} />
                      {test.stderr ? (
                        <Block label="Errors" text={test.stderr} tone="error" />
                      ) : null}
                    </div>
                  ) : null}
                </details>
              </li>
            );
          })}
        </ol>
      ) : null}
      {result.kind === "SUBMIT" && result.results.some((t) => !t.sample) ? (
        <p className="text-xs text-muted-foreground">
          Hidden tests show only pass or fail, like a real assessment.
        </p>
      ) : null}
    </div>
  );
}
