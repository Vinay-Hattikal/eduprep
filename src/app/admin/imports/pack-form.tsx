"use client";

import { useActionState } from "react";
import { FolderArchive } from "lucide-react";
import { uploadPackAction, type UploadState } from "@/app/admin/imports/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Upload a ZIP of a whole content folder (D-061). */
export function PackForm() {
  const [state, action, pending] = useActionState<UploadState, FormData>(uploadPackAction, {});
  return (
    <form action={action} className="space-y-4" aria-label="Content pack">
      {state.error ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="pack-file">ZIP file</Label>
        <Input id="pack-file" name="file" type="file" accept=".zip" required />
        <p className="text-xs text-muted-foreground">
          Folders like 00-taxonomy, 02-mcq/&lt;subject&gt;, 03-coding and 04-companies. Max 25 MB.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="pack-publish" name="publish" />
        <Label htmlFor="pack-publish" className="font-normal">
          Publish after import (questions that pass the checks, coding problems once they pass the
          judge)
        </Label>
      </div>
      <Button type="submit" disabled={pending} data-testid="upload-pack">
        <FolderArchive /> {pending ? "Uploading…" : "Upload pack"}
      </Button>
    </form>
  );
}
