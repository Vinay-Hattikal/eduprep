"use client";

import { useActionState, useState } from "react";
import { submitScorecardAction, type FormState } from "@/app/interviewer/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RECOMMENDATION_LABELS, type RubricItem } from "@/lib/interviews/policies";
import { cn } from "@/lib/utils";

type Recommendation = keyof typeof RECOMMENDATION_LABELS;

/** Rubric scores 1-5 with comments, strengths, improvements, recommendation and topics. */
export function ScorecardForm({
  bookingId,
  rubric,
  topics,
}: {
  bookingId: string;
  rubric: RubricItem[];
  topics: { slug: string; name: string }[];
}) {
  const [scores, setScores] = useState<Record<string, { score: number; comment: string }>>({});
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [state, action, pending] = useActionState<FormState, FormData>(submitScorecardAction, {});
  const complete =
    rubric.every((r) => scores[r.key]?.score) &&
    recommendation &&
    strengths.trim() &&
    improvements.trim();
  const payload = {
    bookingId,
    scores: rubric.map((r) => ({
      key: r.key,
      score: scores[r.key]?.score ?? 0,
      comment: scores[r.key]?.comment ?? "",
    })),
    strengths,
    improvements,
    recommendation,
    recommendedTopics: picked,
  };

  return (
    <form action={action} className="space-y-6" data-testid="scorecard-form">
      <input type="hidden" name="scorecard" value={JSON.stringify(payload)} />
      {rubric.map((item) => (
        <fieldset key={item.key} className="space-y-2">
          <legend className="text-sm font-medium">
            {item.label}{" "}
            <span className="font-normal text-muted-foreground">· {item.description}</span>
          </legend>
          <div className="flex gap-1.5" role="radiogroup" aria-label={item.label}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={scores[item.key]?.score === n}
                data-testid={`score-${item.key}-${n}`}
                onClick={() =>
                  setScores((s) => ({
                    ...s,
                    [item.key]: { comment: s[item.key]?.comment ?? "", score: n },
                  }))
                }
                className={cn(
                  "size-10 rounded-lg border text-sm font-semibold transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  scores[item.key]?.score === n
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-secondary/50",
                )}
              >
                {n}
              </button>
            ))}
          </div>
          <Textarea
            aria-label={`${item.label} comment`}
            rows={2}
            placeholder="What you saw (optional)"
            value={scores[item.key]?.comment ?? ""}
            onChange={(e) =>
              setScores((s) => ({
                ...s,
                [item.key]: { score: s[item.key]?.score ?? 0, comment: e.target.value },
              }))
            }
          />
        </fieldset>
      ))}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="strengths">Strengths</Label>
          <Textarea
            id="strengths"
            rows={4}
            value={strengths}
            onChange={(e) => setStrengths(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="improvements">What to work on</Label>
          <Textarea
            id="improvements"
            rows={4}
            value={improvements}
            onChange={(e) => setImprovements(e.target.value)}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Overall</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Overall recommendation">
          {(Object.keys(RECOMMENDATION_LABELS) as Recommendation[]).map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={recommendation === r}
              data-testid={`recommend-${r}`}
              onClick={() => setRecommendation(r)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                recommendation === r
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-secondary/50",
              )}
            >
              {RECOMMENDATION_LABELS[r]}
            </button>
          ))}
        </div>
      </fieldset>

      {topics.length ? (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">
            Topics to practise (linked for the candidate)
          </legend>
          <div className="grid max-h-48 gap-1.5 overflow-y-auto rounded-lg border p-3 sm:grid-cols-3">
            {topics.map((t) => (
              <div key={t.slug} className="flex items-center gap-2">
                <Checkbox
                  id={`topic-${t.slug}`}
                  checked={picked.includes(t.slug)}
                  onCheckedChange={(v) =>
                    setPicked((p) =>
                      v === true ? [...p, t.slug].slice(0, 10) : p.filter((x) => x !== t.slug),
                    )
                  }
                />
                <Label htmlFor={`topic-${t.slug}`} className="text-sm font-normal">
                  {t.name}
                </Label>
              </div>
            ))}
          </div>
        </fieldset>
      ) : null}

      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" disabled={!complete || pending} data-testid="submit-scorecard">
        {pending ? "Submitting…" : "Submit scorecard"}
      </Button>
    </form>
  );
}
