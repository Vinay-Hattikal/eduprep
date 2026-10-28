"use client";

import { Check, Plus } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  createNodeAction,
  updateNodeAction,
  type TaxonomyFormState,
} from "@/app/admin/taxonomy/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TaxonomyLevel } from "@/server/services/taxonomy";

const initial: TaxonomyFormState = {};

/** Inline rename/reorder for one node. Slugs are shown but never editable. */
export function NodeEditForm({
  level,
  id,
  slug,
  name,
  order,
  canEdit,
}: {
  level: TaxonomyLevel;
  id: string;
  slug: string;
  name: string;
  order: number;
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(updateNodeAction, initial);
  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <input type="hidden" name="level" value={level} />
      <input type="hidden" name="id" value={id} />
      <Input
        name="name"
        defaultValue={name}
        aria-label={`Name of ${slug}`}
        className="h-8 min-w-40 flex-1"
        disabled={!canEdit}
        required
      />
      <Input
        name="order"
        defaultValue={order}
        aria-label={`Order of ${slug}`}
        inputMode="numeric"
        className="tabular h-8 w-16"
        disabled={!canEdit}
      />
      <code className="hidden text-xs text-muted-foreground sm:inline">{slug}</code>
      {canEdit ? (
        <Button
          type="submit"
          size="icon-sm"
          variant="ghost"
          disabled={pending}
          aria-label={`Save ${slug}`}
        >
          <Check />
        </Button>
      ) : null}
    </form>
  );
}

export function NodeCreateForm({
  level,
  parentId,
  label,
}: {
  level: TaxonomyLevel;
  parentId?: string;
  label: string;
}) {
  const [state, action, pending] = useActionState(createNodeAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.error) toast.error(state.error);
    if (state.ok) {
      toast.success(`${label} added`);
      formRef.current?.reset();
    }
  }, [state, label]);

  return (
    <form ref={formRef} action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="level" value={level} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <Input
        name="name"
        placeholder={`New ${label.toLowerCase()} name`}
        aria-label={`${label} name`}
        className="h-8 min-w-40 flex-1"
        required
      />
      <Input
        name="slug"
        placeholder="slug"
        aria-label={`${label} slug`}
        className="h-8 w-40 font-mono"
        required
      />
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        <Plus /> Add
      </Button>
    </form>
  );
}
