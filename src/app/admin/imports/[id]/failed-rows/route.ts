import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { failedRowsCsv } from "@/server/imports/pipeline";

/** CSV of the rows that weren't imported, with an `error` column, to fix and re-upload. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/imports/[id]/failed-rows">,
) {
  const user = await getCurrentUser();
  if (!user || !can(user.roles, "imports.view")) return new Response("Forbidden", { status: 403 });

  const { id } = await params;
  const csv = await failedRowsCsv(id);
  if (csv === null) return new Response("Not found", { status: 404 });

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="import-${id}-errors.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
