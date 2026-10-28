"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { updateSettingAction, type SettingFormState } from "@/app/admin/settings/actions";
import { FormField } from "@/components/shared/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SettingKind } from "@/server/services/settings/registry";

type SettingFormProps = {
  settingKey: string;
  label: string;
  description: string;
  kind: SettingKind;
  /** Value as typed by admins: rupees for money. */
  inputValue: string;
  canEdit: boolean;
};

const UNITS: Record<SettingKind, { prefix?: string; suffix?: string }> = {
  money: { prefix: "₹" },
  percent: { suffix: "%" },
  integer: {},
};

const initialState: SettingFormState = { status: "idle" };

export function SettingForm({
  settingKey,
  label,
  description,
  kind,
  inputValue,
  canEdit,
}: SettingFormProps) {
  const [state, formAction, pending] = useActionState(updateSettingAction, initialState);
  const id = `setting-${settingKey.replace(/\./g, "-")}`;
  const unit = UNITS[kind];

  useEffect(() => {
    if (state.status === "success") toast.success(`${label} saved`);
  }, [state, label]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <input type="hidden" name="key" value={settingKey} />
      <FormField
        id={id}
        label={label}
        description={description}
        error={state.status === "error" ? state.message : undefined}
        className="flex-1"
      >
        {(aria) => (
          <div className="flex max-w-56 items-center gap-2">
            {unit.prefix ? (
              <span className="text-sm text-muted-foreground">{unit.prefix}</span>
            ) : null}
            <Input
              {...aria}
              name="value"
              defaultValue={inputValue}
              inputMode="decimal"
              disabled={!canEdit || pending}
              className="tabular"
              required
            />
            {unit.suffix ? (
              <span className="text-sm text-muted-foreground">{unit.suffix}</span>
            ) : null}
          </div>
        )}
      </FormField>
      {canEdit ? (
        <Button type="submit" variant="outline" disabled={pending} className="sm:mt-6">
          {pending ? "Saving…" : "Save"}
        </Button>
      ) : null}
    </form>
  );
}
