import Link from "next/link";
import type { Recommendation } from "@/generated/prisma/enums";
import {
  averageScore,
  RECOMMENDATION_LABELS,
  scorecardItems,
  type RubricItem,
  type Score,
} from "@/lib/interviews/policies";
import { cn } from "@/lib/utils";

const TONES: Record<Recommendation, string> = {
  HIRE: "border-success/30 bg-success/10 text-success",
  BORDERLINE: "border-warning/30 bg-warning/10 text-warning",
  NOT_YET: "border-destructive/30 bg-destructive/10 text-destructive",
};

/** A submitted scorecard: overall verdict, rubric scores with comments, strengths, next steps. */
export function ScorecardView({
  rubric,
  scorecard,
  topics,
}: {
  rubric: RubricItem[];
  scorecard: {
    scores: Score[];
    strengths: string;
    improvements: string;
    recommendation: Recommendation;
  };
  topics: { slug: string; name: string }[];
}) {
  return (
    <div className="space-y-6" data-testid="scorecard">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm font-semibold",
            TONES[scorecard.recommendation],
          )}
        >
          {RECOMMENDATION_LABELS[scorecard.recommendation]}
        </span>
        <span className="text-sm text-muted-foreground">
          Average {averageScore(scorecard.scores)} / 5
        </span>
      </div>
      <ul className="space-y-4">
        {scorecardItems(rubric, scorecard.scores).map(({ score, ...item }) => {
          return (
            <li key={item.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="font-medium">{item.label}</span>
                <span className="font-semibold tabular-nums">{score.score} / 5</span>
              </div>
              <div className="flex gap-1" role="img" aria-label={`${score.score} out of 5`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <span
                    key={n}
                    className={cn(
                      "h-2 flex-1 rounded-full",
                      n <= score.score ? "bg-primary" : "bg-primary/15",
                    )}
                  />
                ))}
              </div>
              {score.comment ? (
                <p className="text-sm text-muted-foreground">{score.comment}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 rounded-lg border p-4">
          <p className="text-sm font-semibold">Strengths</p>
          <p className="text-sm whitespace-pre-line">{scorecard.strengths}</p>
        </div>
        <div className="space-y-1 rounded-lg border p-4">
          <p className="text-sm font-semibold">Work on</p>
          <p className="text-sm whitespace-pre-line">{scorecard.improvements}</p>
        </div>
      </div>
      {topics.length ? (
        <div className="space-y-2">
          <p className="text-sm font-semibold">Practise these topics</p>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <Link
                key={t.slug}
                href={`/practice/session?topic=${t.slug}`}
                className="rounded-full border px-3 py-1 text-sm hover:bg-secondary/50"
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
