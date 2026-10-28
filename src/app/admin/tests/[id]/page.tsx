import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";
import { transitionBlueprintAction } from "@/app/admin/tests/actions";
import { BlueprintEditor } from "@/app/admin/tests/blueprint-editor";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import {
  getBlueprintForm,
  getBlueprintOptions,
  publishProblems,
  type BlueprintAction,
} from "@/server/services/blueprints";

export const metadata: Metadata = { title: "Mock test" };

const ACTIONS: Record<BlueprintAction, string> = {
  publish: "Publish",
  unpublish: "Unpublish",
  archive: "Archive",
  restore: "Restore to draft",
};

export default function TestPage({ params, searchParams }: PageProps<"/admin/tests/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/tests">
          <ArrowLeft /> Mock tests
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

function parseErrors(value: unknown): string[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

async function Detail({ params, searchParams }: PageProps<"/admin/tests/[id]">) {
  const user = await requirePermission("content.view");
  const { id } = await params;
  const query = await searchParams;
  const [blueprint, options] = await Promise.all([getBlueprintForm(id), getBlueprintOptions()]);
  if (!blueprint) notFound();
  const errors = parseErrors(query.errors);
  // Show what would block publishing while it's still a draft.
  const blockers = blueprint.status === "DRAFT" ? await publishProblems(id) : [];
  const actions: BlueprintAction[] =
    blueprint.status === "DRAFT"
      ? ["publish", "archive"]
      : blueprint.status === "PUBLISHED"
        ? ["unpublish", "archive"]
        : blueprint.status === "ARCHIVED"
          ? ["restore"]
          : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={blueprint.title}
        description={`/tests/${blueprint.slug}`}
        actions={
          <>
            <ContentStatusBadge status={blueprint.status} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/tests/${blueprint.slug}`}>
                <ExternalLink /> Preview
              </Link>
            </Button>
          </>
        }
      />

      {query.saved ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Saved as draft</AlertTitle>
          <AlertDescription>Publish it again when you&apos;re ready.</AlertDescription>
        </Alert>
      ) : null}
      {typeof query.done === "string" ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>Done</AlertTitle>
        </Alert>
      ) : null}
      {errors.length || blockers.length ? (
        <Alert variant={errors.length ? "destructive" : "default"} data-testid="publish-blockers">
          <CircleAlert />
          <AlertTitle>
            {errors.length ? "Couldn't publish" : "Before this can be published"}
          </AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {(errors.length ? errors : blockers).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      {can(user.roles, "content.publish") ? (
        <div className="flex flex-wrap gap-2">
          {actions.map((action) => (
            <form key={action} action={transitionBlueprintAction}>
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="action" value={action} />
              <Button
                type="submit"
                variant={
                  action === "publish"
                    ? "default"
                    : action === "archive"
                      ? "destructive"
                      : "outline"
                }
                data-testid={`blueprint-${action}`}
              >
                {ACTIONS[action]}
              </Button>
            </form>
          ))}
        </div>
      ) : null}

      {can(user.roles, "content.edit") ? (
        <BlueprintEditor initial={blueprint} options={options} />
      ) : null}
    </div>
  );
}
