import { readFile } from "node:fs/promises";
import path from "node:path";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";

const TEMPLATES_DIR = path.resolve("docs/templates");
const ALLOWED = /^(?:[a-z0-9-]+\/)?[a-z0-9-]+\.csv$/;

/** Serves the CSV templates from docs/templates (the single source of truth for formats). */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/imports/templates/[...path]">,
) {
  const user = await getCurrentUser();
  if (!user || !can(user.roles, "imports.view")) return new Response("Forbidden", { status: 403 });

  const relative = (await params).path.join("/");
  if (!ALLOWED.test(relative)) return new Response("Not found", { status: 404 });

  try {
    const file = await readFile(path.join(TEMPLATES_DIR, ...relative.split("/")));
    return new Response(file, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${path.basename(relative)}"`,
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
