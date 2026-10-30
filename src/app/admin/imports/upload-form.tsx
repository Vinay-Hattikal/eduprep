"use client";

import { Download, Upload } from "lucide-react";
import { useActionState, useState } from "react";
import { uploadImportAction, type UploadState } from "@/app/admin/imports/actions";
import { FormField } from "@/components/shared/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

export type ImportTypeOption = {
  type: string;
  label: string;
  description: string;
  template: string;
  allowZip: boolean;
  /** Older multi-file format, listed separately. */
  legacy: boolean;
  /** Supports "Replace all". */
  replace: boolean;
};

const initialState: UploadState = {};

export function UploadForm({
  types,
  canReplace,
  companyId,
}: {
  types: ImportTypeOption[];
  /** Super admins can replace all content of a type. */
  canReplace: boolean;
  /** "Import for this company" (D-067). */
  companyId?: string;
}) {
  const [state, formAction, pending] = useActionState(uploadImportAction, initialState);
  const [selected, setSelected] = useState(types[0]?.type ?? "");
  const [mode, setMode] = useState("ADD_UPDATE");
  const current = types.find((t) => t.type === selected);
  const showMode = canReplace && current?.replace;
  const main = types.filter((t) => !t.legacy);
  const legacy = types.filter((t) => t.legacy);

  return (
    <form action={formAction} className="space-y-4" aria-label="Upload a file">
      {companyId ? <input type="hidden" name="companyId" value={companyId} /> : null}
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          id="import-type"
          label="What are you importing?"
          description={current?.description}
        >
          {(aria) => (
            <NativeSelect
              {...aria}
              name="type"
              value={selected}
              onChange={(event) => {
                setSelected(event.target.value);
                setMode("ADD_UPDATE");
              }}
              className="w-full"
              data-testid="import-type"
            >
              {main.map((t, index) => (
                <NativeSelectOption key={t.type} value={t.type}>
                  {index + 1}. {t.label}
                </NativeSelectOption>
              ))}
              {legacy.length ? (
                <optgroup label="Older multi-file formats">
                  {legacy.map((t) => (
                    <NativeSelectOption key={t.type} value={t.type}>
                      {t.label}
                    </NativeSelectOption>
                  ))}
                </optgroup>
              ) : null}
            </NativeSelect>
          )}
        </FormField>

        <FormField
          id="import-file"
          label="File"
          description={
            current?.allowZip
              ? "CSV or XLSX. Use a ZIP with an assets/ folder when questions have images. Max 25 MB."
              : "CSV or XLSX. Max 25 MB."
          }
        >
          {(aria) => (
            <Input
              {...aria}
              name="file"
              type="file"
              accept={current?.allowZip ? ".csv,.xlsx,.zip" : ".csv,.xlsx"}
              required
              className="cursor-pointer file:mr-3 file:cursor-pointer"
            />
          )}
        </FormField>
      </div>

      {showMode ? (
        <FormField
          id="import-mode"
          label="How to import"
          description={
            mode === "REPLACE"
              ? "The file becomes the full set. Anything not in it is archived (hidden from students, history kept). A backup is saved first, and you confirm after the preview."
              : "Adds new rows and updates changed ones. Nothing is removed."
          }
        >
          {(aria) => (
            <NativeSelect
              {...aria}
              name="mode"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              className="w-full md:w-1/2"
              data-testid="import-mode"
            >
              <NativeSelectOption value="ADD_UPDATE">
                Add and update (recommended)
              </NativeSelectOption>
              <NativeSelectOption value="REPLACE">Replace all (super admin)</NativeSelectOption>
            </NativeSelect>
          )}
        </FormField>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          <Upload /> {pending ? "Uploading…" : "Upload and check"}
        </Button>
        {current ? (
          <Button asChild variant="ghost">
            <a href={`/admin/imports/templates/${current.template}`} download>
              <Download /> Download template
            </a>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
