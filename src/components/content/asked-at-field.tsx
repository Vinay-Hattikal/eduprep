"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { MAX_COMPANY_LINKS, type AskedAtInput } from "@/lib/content/asked-at";

type Row = AskedAtInput & { key: number };

/**
 * "Asked at": the companies that ask this question or problem, each with optional months.
 * Submits parallel `companyId` and `askedIn` fields (D-057).
 */
export function AskedAtField({
  companies,
  initial,
  error,
  disabled,
}: {
  companies: { id: string; name: string }[];
  initial: AskedAtInput[];
  error?: string;
  disabled?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>(() => initial.map((row, key) => ({ ...row, key })));
  const [nextKey, setNextKey] = useState(initial.length);

  const update = (key: number, patch: Partial<AskedAtInput>) =>
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = () => {
    setRows((current) => [...current, { key: nextKey, companyId: "", askedIn: "" }]);
    setNextKey((k) => k + 1);
  };

  return (
    <fieldset className="min-w-0 space-y-3" disabled={disabled}>
      <legend className="text-sm font-medium">Asked at</legend>
      <p className="text-xs text-muted-foreground">
        Companies that ask this, and optionally when (months like 2026-08, separated by commas).
        Changing these doesn&apos;t unpublish anything.
      </p>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <li key={row.key} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div className="space-y-1">
                <Label htmlFor={`asked-company-${row.key}`} className="text-xs">
                  Company {i + 1}
                </Label>
                <NativeSelect
                  id={`asked-company-${row.key}`}
                  name="companyId"
                  value={row.companyId}
                  onChange={(e) => update(row.key, { companyId: e.target.value })}
                  className="w-full"
                >
                  <NativeSelectOption value="">Choose…</NativeSelectOption>
                  {companies.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {c.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1">
                <Label htmlFor={`asked-months-${row.key}`} className="text-xs">
                  Months (optional)
                </Label>
                <Input
                  id={`asked-months-${row.key}`}
                  name="askedIn"
                  value={row.askedIn}
                  onChange={(e) => update(row.key, { askedIn: e.target.value })}
                  placeholder="2026-08, 2026-09"
                  className="font-mono"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
                aria-label={`Remove company ${i + 1}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">Not linked to any company.</p>
      )}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        disabled={rows.length >= MAX_COMPANY_LINKS}
      >
        <Plus /> Add company
      </Button>
    </fieldset>
  );
}
