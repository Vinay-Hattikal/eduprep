"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { quickTopicAction } from "@/app/admin/taxonomy/quick-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * "+ New topic": adds a missing topic without leaving the editor (D-057). `subject` is the
 * subject id, or "dsa" for coding problems.
 */
export function QuickTopic({
  subject,
  onCreated,
  disabled,
}: {
  subject: string;
  onCreated: (topic: { id: string; name: string }) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const result = await quickTopicAction(subject, name);
      if (!result.ok) return setError(result.error);
      setError(null);
      setName("");
      setOpen(false);
      onCreated(result.topic);
    });

  if (!open)
    return (
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0"
        onClick={() => setOpen(true)}
        disabled={disabled || !subject}
      >
        <Plus /> New topic
      </Button>
    );
  return (
    <div className="space-y-1">
      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the topic instead of submitting the whole question.
            if (e.key === "Enter") {
              e.preventDefault();
              create();
            }
          }}
          placeholder="New topic name"
          aria-label="New topic name"
          autoFocus
        />
        <Button type="button" size="sm" onClick={create} disabled={pending || !name.trim()}>
          {pending ? "Adding…" : "Add"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
