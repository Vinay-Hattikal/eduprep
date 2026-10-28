"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ErrorStateProps = {
  title?: string;
  description?: string;
  /** Shows a "Try again" button. */
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  title = "Something went wrong",
  description = "This part of the page couldn't load. Try again, and if it keeps happening, let us know.",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <AlertTriangle className="size-8 text-destructive" aria-hidden="true" />
      <div className="max-w-sm space-y-1">
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          <RotateCcw /> Try again
        </Button>
      ) : null}
    </div>
  );
}
