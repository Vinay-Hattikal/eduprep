"use client";

import { Bookmark, BookmarkCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleSaveJobAction } from "@/app/(public)/jobs/actions";
import { Button } from "@/components/ui/button";

export function SaveJobButton({
  jobId,
  saved: initial,
  label = false,
}: {
  jobId: string;
  saved: boolean;
  /** Show "Save" text next to the icon. */
  label?: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant={label ? "outline" : "ghost"}
      size={label ? "default" : "icon"}
      aria-pressed={saved}
      aria-label={saved ? "Saved. Remove from saved jobs" : "Save job"}
      disabled={pending}
      data-testid="save-job"
      onClick={() =>
        startTransition(async () => {
          const result = await toggleSaveJobAction(jobId);
          if (!result.ok) return void toast.error(result.error);
          setSaved(result.saved);
          toast.success(
            result.saved ? "Saved. Find it under Saved jobs." : "Removed from saved jobs",
          );
        })
      }
    >
      {saved ? <BookmarkCheck className="text-primary" /> : <Bookmark />}
      {label ? (saved ? "Saved" : "Save") : null}
    </Button>
  );
}
