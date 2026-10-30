"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ImportType } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { COMPANY_IMPORT_FIELDS } from "@/server/imports/company-links";
import { createContentPack } from "@/server/imports/content-pack";
import { ACCEPTED_EXTENSIONS, MAX_UPLOAD_BYTES } from "@/server/imports/parse";
import {
  cancelBatch,
  confirmBatch,
  createImportBatch,
  ImportActionError,
  rollbackBatch,
} from "@/server/imports/pipeline";
import { getImportDefinition, IMPORT_DEFINITIONS } from "@/server/imports/registry";
import { REPLACE_CONFIRMATION } from "@/server/imports/types";

export type UploadState = { error?: string };

const IMPORT_TYPES = IMPORT_DEFINITIONS.map((d) => d.type) as [ImportType, ...ImportType[]];

export async function uploadImportAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requirePermission("imports.view");

  const type = z.enum(IMPORT_TYPES).safeParse(formData.get("type"));
  if (!type.success) return { error: "Choose what you're importing." };
  const definition = getImportDefinition(type.data);
  if (!can(user.roles, definition.permission))
    return { error: "Your role can't import this type." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };
  if (file.size > MAX_UPLOAD_BYTES)
    return { error: "The file is larger than 25 MB. Split it into smaller files." };
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ACCEPTED_EXTENSIONS.includes(extension as (typeof ACCEPTED_EXTENSIONS)[number])) {
    return { error: "Upload a .csv, .xlsx or .zip file." };
  }
  if (extension === ".zip" && !definition.allowZip)
    return { error: `${definition.label} can't be uploaded as a ZIP.` };

  // Replace all (D-054): only whoever may change settings (today every admin, D-056), and only
  // for types that support it.
  const mode = formData.get("mode") === "REPLACE" ? "REPLACE" : "ADD_UPDATE";
  if (mode === "REPLACE" && !can(user.roles, "settings.manage"))
    return { error: "You can't replace all content." };
  if (mode === "REPLACE" && !definition.replace)
    return { error: `${definition.label} can't be imported in replace mode.` };

  // "Import for this company" (D-067): only for files of questions, problems or interview questions.
  const companyId = String(formData.get("companyId") ?? "") || undefined;
  if (companyId) {
    if (!COMPANY_IMPORT_FIELDS[type.data])
      return { error: `${definition.label} can't be imported for one company.` };
    if (!(await db.company.count({ where: { id: companyId } })))
      return { error: "This company no longer exists." };
  }

  const batchId = await createImportBatch({
    type: type.data,
    fileName: file.name,
    data: new Uint8Array(await file.arrayBuffer()),
    actorId: user.id,
    mode,
    companyId,
  });
  revalidatePath("/admin/imports");
  redirect(`/admin/imports/${batchId}`);
}

/** Uploads a ZIP of a whole content folder; the worker imports it file by file (D-061). */
export async function uploadPackAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const user = await requirePermission("imports.view");
  if (!can(user.roles, "content.edit") || !can(user.roles, "companies.manage"))
    return { error: "Content packs need permission to import every content type." };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a ZIP file." };
  if (!file.name.toLowerCase().endsWith(".zip")) return { error: "Upload a .zip file." };
  if (file.size > MAX_UPLOAD_BYTES)
    return { error: "The ZIP is larger than 25 MB. Split it into several packs." };

  let packId: string;
  try {
    packId = await createContentPack({
      fileName: file.name,
      data: new Uint8Array(await file.arrayBuffer()),
      actorId: user.id,
      publish: formData.get("publish") === "on",
    });
  } catch (error) {
    if (error instanceof ImportActionError) return { error: error.message };
    throw error;
  }
  revalidatePath("/admin/imports");
  redirect(`/admin/imports/packs/${packId}`);
}

async function runBatchAction(
  formData: FormData,
  action: (batchId: string, actorId: string) => Promise<void>,
  { confirming = false } = {},
) {
  const user = await requirePermission("imports.view");
  const batchId = String(formData.get("batchId") ?? "");
  const batch = await db.importBatch.findUnique({
    where: { id: batchId },
    select: { type: true, mode: true },
  });
  if (!batch) redirect("/admin/imports");
  if (!can(user.roles, getImportDefinition(batch.type).permission)) redirect("/access-denied");

  let error: string | null = null;
  try {
    if (confirming && batch.mode === "REPLACE") {
      if (!can(user.roles, "settings.manage"))
        throw new ImportActionError("Only an admin can confirm a replace.");
      if (String(formData.get("confirmation") ?? "").trim() !== REPLACE_CONFIRMATION)
        throw new ImportActionError(`Type ${REPLACE_CONFIRMATION} to confirm the replace.`);
    }
    await action(batchId, user.id);
  } catch (e) {
    if (!(e instanceof ImportActionError)) throw e;
    error = e.message;
  }
  revalidatePath(`/admin/imports/${batchId}`);
  redirect(`/admin/imports/${batchId}${error ? `?error=${encodeURIComponent(error)}` : ""}`);
}

export async function confirmImportAction(formData: FormData) {
  const publish = formData.get("publish") === "on";
  await runBatchAction(
    formData,
    (batchId, actorId) => confirmBatch(batchId, actorId, { publish }),
    {
      confirming: true,
    },
  );
}

export async function cancelImportAction(formData: FormData) {
  await runBatchAction(formData, cancelBatch);
}

export async function rollbackImportAction(formData: FormData) {
  await runBatchAction(formData, rollbackBatch);
}
