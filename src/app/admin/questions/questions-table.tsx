"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { bulkQuestionAction, type BulkState } from "@/app/admin/questions/actions";
import { DifficultyLabel, ContentStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { ContentStatus, Difficulty, QuestionType } from "@/generated/prisma/enums";
import { ACTION_LABELS, type ContentAction } from "@/lib/content/workflow";

export type QuestionRow = {
  id: string;
  externalId: string;
  excerpt: string;
  subject: string;
  topic: string;
  type: QuestionType;
  difficulty: Difficulty;
  status: ContentStatus;
  updated: string;
  /** Answer shown on public pages without sign-in (D-058). */
  publicSample?: boolean;
};

/** Publishing actions plus the public-sample switches (D-058). */
export type BulkAction = ContentAction | "sample-on" | "sample-off";

const BULK_LABELS: Record<BulkAction, string> = {
  ...ACTION_LABELS,
  "sample-on": "Make public sample",
  "sample-off": "Hide answer from public",
};

const TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE: "Single",
  MULTIPLE: "Multiple",
  NUMERIC: "Numeric",
};
const initialState: BulkState = {};

export function QuestionsTable({
  rows,
  bulkActions,
}: {
  rows: QuestionRow[];
  bulkActions: BulkAction[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [state, formAction, pending] = useActionState(bulkQuestionAction, initialState);
  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <form action={formAction} className="space-y-3">
      {state.message || state.errors?.length ? (
        <Alert variant={state.errors?.length ? "destructive" : "default"}>
          <AlertDescription>
            {state.message}
            {state.errors?.length ? (
              <ul className="mt-1 list-disc pl-5">
                {state.errors.slice(0, 5).map((error) => (
                  <li key={error}>{error}</li>
                ))}
                {state.errors.length > 5 ? <li>…and {state.errors.length - 5} more</li> : null}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {bulkActions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="tabular text-sm text-muted-foreground">{selected.length} selected</span>
          <NativeSelect name="action" size="sm" aria-label="Bulk action" defaultValue="">
            <NativeSelectOption value="" disabled>
              Choose action…
            </NativeSelectOption>
            {bulkActions.map((action) => (
              <NativeSelectOption key={action} value={action}>
                {BULK_LABELS[action]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={pending || selected.length === 0}
          >
            {pending ? "Applying…" : "Apply"}
          </Button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <caption className="sr-only">Questions</caption>
          <thead className="bg-surface text-left text-muted-foreground">
            <tr>
              {bulkActions.length > 0 ? (
                <th className="w-10 px-3 py-2">
                  <Checkbox
                    aria-label="Select all on this page"
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setSelected(checked === true ? rows.map((r) => r.id) : [])
                    }
                  />
                </th>
              ) : null}
              <th className="px-3 py-2 font-medium">Question</th>
              <th className="hidden px-3 py-2 font-medium md:table-cell">Topic</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">Type</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="hidden px-3 py-2 font-medium lg:table-cell">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={row.id} className="align-top hover:bg-muted/40">
                {bulkActions.length > 0 ? (
                  <td className="px-3 py-3">
                    <Checkbox
                      name="ids"
                      value={row.id}
                      aria-label={`Select ${row.externalId}`}
                      checked={selected.includes(row.id)}
                      onCheckedChange={(checked) =>
                        setSelected((prev) =>
                          checked === true ? [...prev, row.id] : prev.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </td>
                ) : null}
                <td className="max-w-md px-3 py-3">
                  <Link
                    href={`/admin/questions/${row.id}`}
                    className="font-mono text-xs font-medium text-primary hover:underline"
                  >
                    {row.externalId}
                  </Link>
                  <p className="line-clamp-2 text-sm">{row.excerpt}</p>
                  {row.publicSample ? (
                    <Badge variant="outline" className="mt-1">
                      Public sample
                    </Badge>
                  ) : null}
                </td>
                <td className="hidden px-3 py-3 md:table-cell">
                  <p>{row.topic}</p>
                  <p className="text-xs text-muted-foreground">{row.subject}</p>
                </td>
                <td className="hidden px-3 py-3 lg:table-cell">
                  <p>{TYPE_LABELS[row.type]}</p>
                  <DifficultyLabel difficulty={row.difficulty} />
                </td>
                <td className="px-3 py-3">
                  <ContentStatusBadge status={row.status} />
                </td>
                <td className="hidden px-3 py-3 whitespace-nowrap text-muted-foreground lg:table-cell">
                  {row.updated}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
