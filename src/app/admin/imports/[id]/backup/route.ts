import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { storage } from "@/server/integrations/storage";
import { getImportDefinition } from "@/server/imports/registry";

/** The export taken before a replace import archived anything (D-054). */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/imports/[id]/backup">,
) {
  const user = await getCurrentUser();
  if (!user || !can(user.roles, "imports.view")) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const batch = await db.importBatch.findUnique({
    where: { id },
    select: { type: true, backupKey: true },
  });
  if (!batch?.backupKey) return new Response("Not found", { status: 404 });
  if (!can(user.roles, getImportDefinition(batch.type).permission))
    return new Response("Forbidden", { status: 403 });

  const data = await storage.get(batch.backupKey);
  if (!data) return new Response("Not found", { status: 404 });
  const fileName = batch.backupKey
    .split("/")
    .pop()!
    .replace(/^backup-/, "");
  return new Response(`﻿${new TextDecoder().decode(data)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
