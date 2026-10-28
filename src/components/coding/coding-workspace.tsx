"use client";

import { CheckCircle2, Lightbulb, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  pollSubmissionAction,
  revealHintAction,
  runCodeAction,
} from "@/app/(student)/coding/actions";
import { CodePanel, type PanelLanguage } from "@/components/coding/code-panel";
import { ProblemStatement, type StatementProblem } from "@/components/coding/problem-statement";
import { Markdown } from "@/components/shared/markdown";
import { VerdictBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import type { CodingLanguage, VerdictName } from "@/lib/coding/languages";
import { cn } from "@/lib/utils";

export type WorkspaceData = StatementProblem & {
  id: string;
  slug: string;
  languages: PanelLanguage[];
  starters: Partial<Record<CodingLanguage, string>>;
  hintCount: number;
  hints: string[];
  editorial: string | null;
  editorialLocked: boolean;
  solved: boolean;
  locked: boolean;
};

export type HistoryEntry = {
  id: string;
  language: string;
  verdict: VerdictName;
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number | null;
  createdAt: string;
  code: string;
};

const TABS = [
  { id: "problem", label: "Problem" },
  { id: "hints", label: "Hints" },
  { id: "submissions", label: "Submissions" },
] as const;

export function CodingWorkspace({
  problem,
  history,
}: {
  problem: WorkspaceData;
  history: HistoryEntry[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("problem");
  const [pending, startTransition] = useTransition();
  const [openCode, setOpenCode] = useState<string | null>(null);

  const nextStepIsEditorial = problem.hints.length >= problem.hintCount;
  const canReveal =
    !problem.solved && (problem.hints.length < problem.hintCount || problem.editorialLocked);

  return (
    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
      <section className="min-w-0 rounded-xl border bg-card">
        <div role="tablist" aria-label="Problem details" className="flex gap-1 border-b p-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              onClick={() => setTab(t.id)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                tab === t.id
                  ? "bg-secondary text-secondary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {t.id === "submissions" && history.length ? ` (${history.length})` : ""}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          className="p-4 sm:p-6 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto"
        >
          {tab === "problem" ? <ProblemStatement problem={problem} /> : null}

          {tab === "hints" ? (
            <div className="space-y-4" data-testid="hints-panel">
              {problem.hintCount === 0 && !problem.editorial && !problem.editorialLocked ? (
                <p className="text-sm text-muted-foreground">This problem has no hints.</p>
              ) : null}
              {problem.hints.map((hint, i) => (
                <div key={i} className="rounded-lg border bg-surface p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-medium">
                    <Lightbulb className="size-4 text-warning" aria-hidden="true" /> Hint {i + 1}
                  </p>
                  <Markdown className="text-base">{hint}</Markdown>
                </div>
              ))}
              {problem.editorial ? (
                <div className="rounded-lg border p-4">
                  <p className="mb-2 font-semibold">Editorial</p>
                  <Markdown className="text-base">{problem.editorial}</Markdown>
                </div>
              ) : null}
              {canReveal ? (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    {nextStepIsEditorial
                      ? "Still stuck? The editorial explains the full approach."
                      : `Try on your own first. ${problem.hintCount - problem.hints.length} hint${problem.hintCount - problem.hints.length === 1 ? "" : "s"} left; each one gives a little more away.`}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await revealHintAction(problem.id);
                        router.refresh();
                      })
                    }
                    data-testid="reveal-hint"
                  >
                    {nextStepIsEditorial
                      ? "Show the editorial"
                      : `Show hint ${problem.hints.length + 1}`}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {tab === "submissions" ? (
            history.length ? (
              <ul className="divide-y">
                {history.map((s) => (
                  <li key={s.id} className="py-3 first:pt-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                      <VerdictBadge verdict={s.verdict} />
                      <span className="text-muted-foreground">{s.language}</span>
                      {s.verdict !== "COMPILATION_ERROR" ? (
                        <span className="text-muted-foreground">
                          {s.testsPassed}/{s.testsTotal}
                        </span>
                      ) : null}
                      {s.runtimeMs !== null ? (
                        <span className="text-muted-foreground">{s.runtimeMs} ms</span>
                      ) : null}
                      <time
                        className="ml-auto text-xs text-muted-foreground"
                        dateTime={s.createdAt}
                      >
                        {new Date(s.createdAt).toLocaleString("en-IN", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </time>
                    </div>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0"
                      onClick={() => setOpenCode(openCode === s.id ? null : s.id)}
                    >
                      {openCode === s.id ? "Hide code" : "View code"}
                    </Button>
                    {openCode === s.id ? (
                      <pre className="mt-1 max-h-72 overflow-auto rounded-lg border bg-surface p-3 font-mono text-xs">
                        {s.code}
                      </pre>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Your submissions will appear here.</p>
            )
          ) : null}
        </div>
      </section>

      <section className="min-w-0 space-y-3" aria-label="Code">
        {problem.solved ? (
          <p className="flex items-center gap-2 text-sm font-medium text-success">
            <CheckCircle2 className="size-4" aria-hidden="true" /> Solved
          </p>
        ) : null}
        {problem.locked ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="size-4" aria-hidden="true" /> Free plan limit reached
          </p>
        ) : null}
        <CodePanel
          languages={problem.languages}
          starters={problem.starters}
          draftKey={`code-draft:${problem.slug}`}
          submit={(input) => runCodeAction({ problemId: problem.id, ...input })}
          poll={pollSubmissionAction}
          onDone={(result) => {
            if (result.kind === "SUBMIT") router.refresh();
          }}
          disabled={problem.locked}
          disabledReason="You've used all the coding problems in the free plan. Problems you've already started stay open."
        />
      </section>
    </div>
  );
}
