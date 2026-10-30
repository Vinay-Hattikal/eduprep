"use client";

// The exam screen (PRD 4.6). The server owns the clock and the answers: every change is saved
// immediately, the timer is the server's deadline corrected for clock skew, and when a section
// ends the page reloads its state from the server.

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  Flag,
  Grid3x3,
  Loader2,
  Maximize,
  Minimize,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { pollSubmissionAction } from "@/app/(student)/coding/actions";
import {
  advanceSectionAction,
  runTestCodeAction,
  saveItemAction,
  submitTestAction,
  tabSwitchAction,
} from "@/app/(student)/tests/actions";
import { CodePanel } from "@/components/coding/code-panel";
import { ProblemStatement } from "@/components/coding/problem-statement";
import { McqView } from "@/components/exam/mcq-view";
import { EXAM_STYLES } from "@/components/exam/platform-styles";
import {
  PaletteLegend,
  QuestionPalette,
  type PaletteState,
} from "@/components/exam/question-palette";
import { VerdictBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { VerdictName } from "@/lib/coding/languages";
import { cn } from "@/lib/utils";
import type { RunnerItem, RunnerView } from "@/server/services/tests";

type Answer = {
  selectedOptions: string[];
  numericAnswer: number | null;
  markedForReview: boolean;
  visited: boolean;
  codingVerdict: VerdictName | null;
};

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function stateOf(answer: Answer, kind: RunnerItem["kind"]): PaletteState {
  const answered =
    kind === "coding"
      ? answer.codingVerdict !== null
      : answer.selectedOptions.length > 0 || answer.numericAnswer !== null;
  if (answer.markedForReview) return answered ? "answered-review" : "review";
  if (answered) return "answered";
  return answer.visited ? "not-answered" : "not-visited";
}

export function ExamRunner({ view }: { view: RunnerView }) {
  const router = useRouter();
  const style = EXAM_STYLES[view.platformStyle];
  const sequential = view.navigation === "SEQUENTIAL";

  const [answers, setAnswers] = useState<Record<string, Answer>>(() =>
    Object.fromEntries(
      view.items.map((item) => [
        item.id,
        {
          selectedOptions: item.selectedOptions,
          numericAnswer: item.numericAnswer,
          markedForReview: item.markedForReview,
          visited: item.visited,
          codingVerdict: item.kind === "coding" ? item.coding.lastVerdict : null,
        },
      ]),
    ),
  );
  const { items: allItems, current: openSection } = view;
  const openItems = useMemo(
    () => (sequential ? allItems.filter((i) => i.section === openSection) : allItems),
    [sequential, allItems, openSection],
  );
  const [currentId, setCurrentId] = useState(() => openItems[0]?.id ?? view.items[0]!.id);
  const current = view.items.find((i) => i.id === currentId)!;
  const section = view.sections[current.section]!;
  const number = view.items.indexOf(current) + 1;

  // ---------- clock ----------
  const [offset] = useState(() => view.serverNow - Date.now());
  const [now, setNow] = useState(() => view.serverNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offset), 1000);
    return () => clearInterval(timer);
  }, [offset]);
  const deadline =
    sequential && view.current !== null ? view.sections[view.current]!.end : view.endsAt;
  const remaining = deadline - now;
  const lastSection = !sequential || view.current === view.sections.length - 1;

  // ---------- saving ----------
  const [saving, setSaving] = useState(0);
  const [offline, setOffline] = useState(false);
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const save = useCallback(
    (itemId: string, patch: Parameters<typeof saveItemAction>[2]) => {
      setSaving((n) => n + 1);
      chain.current = chain.current
        .then(async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const result = await saveItemAction(view.id, itemId, patch);
              setOffline(false);
              if (!result.ok && result.reason === "closed")
                toast.error("Time's up for this section: that change wasn't saved.");
              return;
            } catch {
              setOffline(true);
              await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
            }
          }
        })
        .finally(() => setSaving((n) => n - 1));
    },
    [view.id],
  );

  // Time on each question: counted while it's on screen, sent when leaving it (and every 30 s).
  const enteredAt = useRef(0);
  const flushTime = useCallback(
    (itemId: string) => {
      const seconds = (Date.now() - enteredAt.current) / 1000;
      enteredAt.current = Date.now();
      if (seconds >= 1) save(itemId, { addTimeSec: Math.round(seconds) });
    },
    [save],
  );
  useEffect(() => {
    enteredAt.current = Date.now();
    if (!answers[currentId]?.visited) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mirrors the server's "visited" flag
      setAnswers((a) => ({ ...a, [currentId]: { ...a[currentId]!, visited: true } }));
      save(currentId, { visited: true });
    }
    const timer = setInterval(() => flushTime(currentId), 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per question shown
  }, [currentId]);

  const update = (patch: Partial<Answer>, server: Parameters<typeof saveItemAction>[2]) => {
    setAnswers((a) => ({ ...a, [currentId]: { ...a[currentId]!, ...patch } }));
    save(currentId, server);
  };

  // ---------- navigation ----------
  const [furthest, setFurthest] = useState<Record<number, number>>(() => {
    const opened: Record<number, number> = {};
    for (const item of view.items)
      if (item.visited) opened[item.section] = Math.max(opened[item.section] ?? 0, item.position);
    return opened;
  });
  const isLocked = (item: RunnerItem) => {
    if (sequential && item.section !== view.current) return true;
    const rules = view.sections[item.section]!;
    return !rules.canGoBack && item.position < (furthest[item.section] ?? 0);
  };
  const go = (itemId: string) => {
    if (itemId === currentId) return;
    const target = view.items.find((i) => i.id === itemId);
    if (!target || isLocked(target)) return;
    flushTime(currentId);
    setFurthest((f) => ({
      ...f,
      [target.section]: Math.max(f[target.section] ?? 0, target.position),
    }));
    setCurrentId(itemId);
    setPaletteOpen(false);
  };
  const index = openItems.findIndex((i) => i.id === currentId);
  const previous = openItems[index - 1];
  const next = openItems[index + 1];

  // ---------- section end and submit ----------
  const [confirm, setConfirm] = useState<"submit" | "section" | null>(null);
  const [submitting, startSubmit] = useTransition();
  const ended = useRef(false);
  const finish = useCallback(() => {
    flushTime(currentId);
    startSubmit(async () => {
      await chain.current;
      await submitTestAction(view.id);
    });
  }, [currentId, flushTime, view.id]);
  const endSection = () => {
    flushTime(currentId);
    startSubmit(async () => {
      await chain.current;
      await advanceSectionAction(view.id, view.current ?? 0);
      router.refresh();
    });
  };
  useEffect(() => {
    if (remaining > 0 || ended.current) return;
    ended.current = true;
    if (lastSection) {
      toast.info("Time's up. Submitting your test…");
      finish();
    } else {
      toast.info("Time's up for this section. The next one has started.");
      flushTime(currentId);
      router.refresh();
    }
  }, [remaining, lastSection, finish, flushTime, currentId, router]);

  // ---------- proctoring: tab switches, leaving, full screen ----------
  const [tabSwitches, setTabSwitches] = useState(view.tabSwitches);
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      setTabSwitches((n) => n + 1);
      void tabSwitchAction(view.id);
    };
    const onLeave = (event: BeforeUnloadEvent) => {
      if (!ended.current) event.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [view.id]);
  useEffect(() => {
    if (tabSwitches > view.tabSwitches) {
      toast.warning(
        `You left the test window (${tabSwitches} time${tabSwitches === 1 ? "" : "s"}). Real tests may end your attempt for this.`,
      );
    }
  }, [tabSwitches, view.tabSwitches]);

  const [fullscreen, setFullscreen] = useState(false);
  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else
      void document.documentElement
        .requestFullscreen?.()
        .catch(() => toast.error("Full screen isn't available here."));
  };

  // ---------- palette ----------
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteSection = sequential ? view.current : current.section;
  const paletteItems = view.items
    .filter((i) => i.section === paletteSection)
    .map((i) => ({
      id: i.id,
      number: view.items.indexOf(i) + 1,
      state: stateOf(answers[i.id]!, i.kind),
      locked: isLocked(i),
    }));
  const counts = useMemo(() => {
    const result: Record<PaletteState, number> = {
      answered: 0,
      "not-answered": 0,
      review: 0,
      "answered-review": 0,
      "not-visited": 0,
    };
    for (const i of view.items) result[stateOf(answers[i.id]!, i.kind)] += 1;
    return result;
  }, [answers, view.items]);
  const unanswered = counts["not-answered"] + counts["not-visited"] + counts.review;

  // The legend beside the palette counts the section on screen; the submit dialog counts all.
  const sectionCounts: Record<PaletteState, number> = {
    answered: 0,
    "not-answered": 0,
    review: 0,
    "answered-review": 0,
    "not-visited": 0,
  };
  for (const item of paletteItems) sectionCounts[item.state] += 1;

  const palette = (
    <div className="space-y-4">
      <QuestionPalette items={paletteItems} currentId={currentId} onSelect={go} />
      <PaletteLegend counts={sectionCounts} />
    </div>
  );

  const warn =
    remaining < 60_000 ? "text-destructive" : remaining < 5 * 60_000 ? "text-warning" : "";
  const answer = answers[currentId]!;

  return (
    <div
      className="flex min-h-dvh flex-col bg-background"
      data-testid="exam-runner"
      data-platform={view.platformStyle}
    >
      <header className={cn("sticky top-0 z-30", style.header)}>
        <div className="flex items-center gap-3 px-3 py-2 sm:px-4">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{view.title}</p>
            <p className="truncate text-xs opacity-80">
              {section.name}
              {sequential ? ` · Section ${(view.current ?? 0) + 1} of ${view.sections.length}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1.5 text-xs" aria-live="polite">
            {offline ? (
              <span className="inline-flex items-center gap-1 text-destructive">
                <CloudOff className="size-4" aria-hidden="true" />{" "}
                <span className="hidden sm:inline">Reconnecting…</span>
              </span>
            ) : saving > 0 ? (
              <span className="inline-flex items-center gap-1 opacity-80">
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />{" "}
                <span className="hidden sm:inline">Saving</span>
              </span>
            ) : (
              <span className="hidden opacity-80 sm:inline">All changes saved</span>
            )}
          </div>
          <div
            className={cn(
              "rounded-md bg-background/10 px-2.5 py-1 font-mono text-lg font-semibold tabular-nums",
              warn,
            )}
            role="timer"
            aria-label={`Time left ${sequential ? "in this section" : ""}: ${formatClock(remaining)}`}
            data-testid="exam-timer"
          >
            {formatClock(remaining)}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="hidden sm:inline-flex"
            aria-label={fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen ? <Minimize /> : <Maximize />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setPaletteOpen(true)}
            aria-label="Question palette"
          >
            <Grid3x3 />
          </Button>
        </div>
        {style.sectionTabs && !sequential && view.sections.length > 1 ? (
          <nav
            aria-label="Sections"
            className="flex gap-1 overflow-x-auto border-t border-current/10 px-3 pb-1.5 sm:px-4"
          >
            {view.sections.map((s, i) => {
              const first = view.items.find((item) => item.section === i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => first && go(first.id)}
                  aria-current={current.section === i ? "true" : undefined}
                  className={cn(
                    "mt-1.5 shrink-0 rounded-md px-3 py-1 text-xs font-medium",
                    current.section === i
                      ? "bg-background text-foreground"
                      : "opacity-80 hover:opacity-100",
                  )}
                >
                  {s.name}
                </button>
              );
            })}
          </nav>
        ) : null}
      </header>

      <div
        className={cn(
          "mx-auto flex w-full max-w-7xl flex-1 gap-6 px-3 py-4 sm:px-4 lg:py-6",
          style.palette === "left" && "lg:flex-row-reverse",
        )}
      >
        <main className="min-w-0 flex-1 space-y-6">
          {current.kind === "mcq" ? (
            <McqView
              key={current.id}
              number={number}
              question={current.question}
              selected={answer.selectedOptions}
              numeric={answer.numericAnswer}
              onSelect={(options) =>
                update({ selectedOptions: options }, { selectedOptions: options })
              }
              onNumeric={(value) => update({ numericAnswer: value }, { numericAnswer: value })}
            />
          ) : (
            <div className="grid min-w-0 gap-6 xl:grid-cols-2">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-muted-foreground">Question {number}</p>
                  {answer.codingVerdict ? <VerdictBadge verdict={answer.codingVerdict} /> : null}
                </div>
                <h2 className="text-xl font-semibold">{current.problem.title}</h2>
                <ProblemStatement problem={current.problem} />
                <p className="text-xs text-muted-foreground">
                  {current.problem.scoring === "PER_TEST"
                    ? "Partial marks for each hidden test passed."
                    : "Full marks only when every test passes."}{" "}
                  Your best submission counts.
                </p>
              </div>
              <CodePanel
                key={current.id}
                languages={current.problem.languages}
                starters={current.problem.starters}
                draftKey={`test-code-draft:${view.id}:${current.id}`}
                initial={current.coding.lastCode}
                editorHeight="360px"
                submit={(input) => runTestCodeAction(view.id, current.id, input)}
                poll={pollSubmissionAction}
                onDone={(result) => {
                  if (result.kind === "SUBMIT") {
                    setAnswers((a) => ({
                      ...a,
                      [current.id]: { ...a[current.id]!, codingVerdict: result.verdict },
                    }));
                  }
                }}
              />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => previous && go(previous.id)}
              disabled={!previous || isLocked(previous)}
            >
              <ChevronLeft /> {style.labels.previous}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                update(
                  { markedForReview: !answer.markedForReview },
                  { markedForReview: !answer.markedForReview },
                );
                if (!answer.markedForReview && next) go(next.id);
              }}
              data-testid="mark-review"
            >
              <Flag /> {answer.markedForReview ? "Unmark" : style.labels.markNext}
            </Button>
            {current.kind === "mcq" ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  update(
                    { selectedOptions: [], numericAnswer: null },
                    current.question.type === "NUMERIC"
                      ? { numericAnswer: null }
                      : { selectedOptions: [] },
                  )
                }
              >
                {style.labels.clear}
              </Button>
            ) : null}
            <div className="ml-auto flex flex-wrap gap-2">
              {next ? (
                <Button type="button" onClick={() => go(next.id)} data-testid="next-question">
                  {style.labels.next} <ChevronRight />
                </Button>
              ) : !lastSection ? (
                <Button
                  type="button"
                  onClick={() => setConfirm("section")}
                  data-testid="end-section"
                >
                  {style.labels.endSection} <ChevronRight />
                </Button>
              ) : null}
              {lastSection ? (
                <Button
                  type="button"
                  variant={next ? "outline" : "default"}
                  onClick={() => setConfirm("submit")}
                  data-testid="submit-test"
                >
                  <Send /> {style.labels.submit}
                </Button>
              ) : null}
            </div>
          </div>
        </main>

        <aside className="hidden w-72 shrink-0 lg:block" aria-label="Question palette">
          <div className="sticky top-24 space-y-4 rounded-xl border bg-card p-4">
            <p className="text-sm font-semibold">{view.sections[paletteSection ?? 0]?.name}</p>
            {palette}
            {tabSwitches > 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="size-3.5" aria-hidden="true" /> Left the window{" "}
                {tabSwitches}×
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{view.sections[paletteSection ?? 0]?.name}</SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-6">{palette}</div>
        </SheetContent>
      </Sheet>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirm === "section" ? `Finish “${section.name}”?` : "Submit the test?"}
            </DialogTitle>
            <DialogDescription>
              {confirm === "section"
                ? "You can't come back to this section. Any unused time is lost."
                : unanswered
                  ? `${unanswered} question${unanswered === 1 ? " is" : "s are"} unanswered or marked for review. You can't change answers after submitting.`
                  : "You've answered everything. You can't change answers after submitting."}
            </DialogDescription>
          </DialogHeader>
          <PaletteLegend counts={counts} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirm(null)}
              disabled={submitting}
            >
              Keep going
            </Button>
            <Button
              type="button"
              onClick={() => {
                ended.current = confirm === "submit";
                if (confirm === "section") endSection();
                else finish();
                setConfirm(null);
              }}
              disabled={submitting}
              data-testid="confirm-submit"
            >
              {submitting ? "Submitting…" : confirm === "section" ? "Finish section" : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {submitting ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/85"
          role="status"
          aria-live="assertive"
        >
          <p className="flex items-center gap-2 font-medium">
            <Loader2 className="size-5 animate-spin" aria-hidden="true" /> Saving your answers…
          </p>
        </div>
      ) : null}
    </div>
  );
}
