"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { quickPassageAction } from "@/app/admin/passages/quick-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

/**
 * "+ New passage": writes a reading-comprehension or data passage without leaving the question
 * editor (D-067), then fills the question's passage ID.
 */
export function QuickPassage({ onCreated }: { onCreated: (externalId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState({ externalId: "", title: "", body: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof typeof values, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  const create = () =>
    startTransition(async () => {
      const result = await quickPassageAction(values);
      if (!result.ok) return setError(result.error);
      setError(null);
      setValues({ externalId: "", title: "", body: "" });
      setOpen(false);
      onCreated(result.externalId);
    });

  if (!open)
    return (
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0"
        onClick={() => setOpen(true)}
      >
        <Plus /> New passage
      </Button>
    );
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3" data-testid="quick-passage">
      <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
        <Input
          value={values.externalId}
          onChange={(e) => set("externalId", e.target.value)}
          placeholder="ID, e.g. RC-0042"
          aria-label="New passage ID"
          className="font-mono"
          autoFocus
        />
        <Input
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Title"
          aria-label="New passage title"
        />
      </div>
      <Textarea
        value={values.body}
        onChange={(e) => set("body", e.target.value)}
        placeholder="The passage (Markdown; tables work)"
        aria-label="New passage text"
        rows={6}
      />
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={create} disabled={pending}>
          {pending ? "Adding…" : "Add passage"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
