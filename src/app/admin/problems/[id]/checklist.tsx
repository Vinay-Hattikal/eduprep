import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

/** What a coding problem still needs before students can see it (D-034, D-057). */
export function ProblemChecklist({ steps }: { steps: { label: string; done: boolean }[] }) {
  const left = steps.filter((s) => !s.done).length;
  return (
    <section
      aria-label="Steps to publish"
      className="rounded-xl border bg-surface p-4"
      data-testid="problem-checklist"
    >
      <p className="mb-2 text-sm font-medium">
        {left
          ? `${left} step${left === 1 ? "" : "s"} left before students see this problem`
          : "Live for students"}
      </p>
      <ol className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {steps.map((step) => (
          <li
            key={step.label}
            className={cn(
              "flex items-center gap-1.5",
              step.done ? "text-success" : "text-muted-foreground",
            )}
          >
            {step.done ? (
              <CheckCircle2 className="size-4" aria-hidden="true" />
            ) : (
              <Circle className="size-4" aria-hidden="true" />
            )}
            <span>
              {step.label}
              <span className="sr-only">{step.done ? " (done)" : " (to do)"}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
