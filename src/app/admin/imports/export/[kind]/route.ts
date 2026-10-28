import { can, type Permission } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { exportCodingBundle } from "@/server/imports/definitions/coding-bundle";
import { exportCompanyProcess } from "@/server/imports/definitions/company-process";
import { exportCompanies } from "@/server/imports/definitions/companies";
import { exportMcq } from "@/server/imports/definitions/mcq";

// Download what's saved now, in the same format as the upload, to edit and re-upload (D-054).
// Admins don't need to keep their own copies of the files.

const EXPORTS: Record<
  string,
  { permission: Permission; run(url: URL): Promise<{ fileName: string; csv: string } | null> }
> = {
  coding: {
    permission: "content.edit",
    run: async () => ({ fileName: "coding-problems.csv", csv: (await exportCodingBundle(db)).csv }),
  },
  companies: {
    permission: "companies.manage",
    run: async () => ({ fileName: "companies.csv", csv: await exportCompanies(db) }),
  },
  "company-process": {
    permission: "companies.manage",
    run: async () => ({ fileName: "company-process.csv", csv: await exportCompanyProcess(db) }),
  },
  mcq: {
    permission: "content.edit",
    async run(url) {
      const subject = url.searchParams.get("subject") ?? "";
      if (!/^[a-z0-9-]{1,80}$/.test(subject)) return null;
      const exists = await db.subject.findUnique({
        where: { slug: subject },
        select: { id: true },
      });
      return exists ? { fileName: `${subject}.csv`, csv: await exportMcq(db, subject) } : null;
    },
  },
};

export async function GET(
  request: Request,
  { params }: RouteContext<"/admin/imports/export/[kind]">,
) {
  const user = await getCurrentUser();
  const { kind } = await params;
  const entry = Object.hasOwn(EXPORTS, kind) ? EXPORTS[kind] : undefined;
  if (!entry) return new Response("Not found", { status: 404 });
  if (!user || !can(user.roles, "imports.view") || !can(user.roles, entry.permission))
    return new Response("Forbidden", { status: 403 });

  const result = await entry.run(new URL(request.url));
  if (!result) return new Response("Not found", { status: 404 });
  return new Response(`﻿${result.csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
