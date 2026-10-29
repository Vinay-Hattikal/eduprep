import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  CircleMinus,
  Loader2,
  XCircle,
} from "lucide-react";
import { AutoRefresh } from "@/components/shared/auto-refresh";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { StatCard } from "@/components/shared/stat-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import type { PackFileResult } from "@/server/imports/content-pack";
import { IMPORT_DEFINITIONS } from "@/server/imports/registry";

export const metadata: Metadata = { title: "Content pack" };

const TYPE_LABELS = Object.fromEntries(IMPORT_DEFINITIONS.map((d) => [d.type, d.label]));

export default function ContentPackPage({ params }: PageProps<"/admin/imports/packs/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/imports">
          <ArrowLeft /> Imports
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Pack params={params} />
      </Suspense>
    </div>
  );
}

const ICONS = {
  imported: <CheckCircle2 className="size-4 text-success" aria-hidden="true" />,
  failed: <XCircle className="size-4 text-destructive" aria-hidden="true" />,
  skipped: <CircleMinus className="size-4 text-muted-foreground" aria-hidden="true" />,
};

async function Pack({ params }: { params: PageProps<"/admin/imports/packs/[id]">["params"] }) {
  await requirePermission("imports.view");
  const { id } = await params;
  const pack = await db.contentPack.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true } } },
  });
  if (!pack) notFound();
  const results = pack.results as unknown as PackFileResult[];
  const running = pack.status === "QUEUED" || pack.status === "RUNNING";
  const count = (outcome: PackFileResult["outcome"]) =>
    results.filter((r) => r.outcome === outcome).length;

  return (
    <div className="space-y-6">
      {running ? <AutoRefresh intervalMs={2000} /> : null}
      <PageHeader
        title={pack.fileName}
        description={`Uploaded ${formatDateTime(pack.createdAt)}${pack.createdBy ? ` by ${pack.createdBy.name}` : ""}${pack.publish ? " · publish after import" : ""}`}
      />
      {running ? (
        <p className="flex items-center gap-2 text-sm text-info" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Importing file {results.length + 1}… This page updates by itself.
        </p>
      ) : null}
      {pack.status === "FAILED" ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>The pack stopped</AlertTitle>
          <AlertDescription>{pack.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Imported" value={count("imported")} />
        <StatCard label="With problems" value={count("failed")} />
        <StatCard label="Empty, skipped" value={count("skipped")} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Files, in import order</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {results.length ? (
            <ol className="divide-y rounded-lg border">
              {results.map((r) => (
                <li key={r.path} className="space-y-1 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    {ICONS[r.outcome]}
                    {r.batchId ? (
                      <Link
                        href={`/admin/imports/${r.batchId}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {r.path}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs">{r.path}</span>
                    )}
                    <span className="text-xs text-muted-foreground">{TYPE_LABELS[r.type]}</span>
                    {r.outcome !== "skipped" ? (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {r.created ?? 0} new · {r.updated ?? 0} updated · {r.unchanged ?? 0} no
                        change
                      </span>
                    ) : null}
                  </div>
                  {r.problems.length ? (
                    <ul className="list-disc pl-8 text-xs text-muted-foreground">
                      {r.problems.slice(0, 5).map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                      {r.problems.length > 5 ? (
                        <li>…and {r.problems.length - 5} more: open the file to see them all.</li>
                      ) : null}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No files imported yet.</p>
          )}
        </CardContent>
      </Card>

      {pack.unknownFiles.length ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Not imported: files outside the folder layout</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-5 font-mono text-xs">
              {pack.unknownFiles.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
