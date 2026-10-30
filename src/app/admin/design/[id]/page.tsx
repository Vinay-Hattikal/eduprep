import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, Plus } from "lucide-react";
import { setDesignStatusAction } from "@/app/admin/design/actions";
import { DesignForm } from "@/app/admin/design/design-form";
import { PageHeader } from "@/components/shared/page-header";
import { companyTabHref } from "@/lib/content/companies";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ContentStatus } from "@/generated/prisma/enums";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { designFormOptions, getAdminDesignQuestion } from "@/server/services/design-questions";
import { DESIGN_KIND_LABELS } from "@/lib/content/design";

export const metadata: Metadata = { title: "Design question" };

export default function DesignQuestionPage({
  params,
  searchParams,
}: PageProps<"/admin/design/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/design">
          <ArrowLeft /> Design questions
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const STATUS_BUTTONS: Record<ContentStatus, { status: ContentStatus; label: string }[]> = {
  DRAFT: [
    { status: "PUBLISHED", label: "Publish" },
    { status: "ARCHIVED", label: "Archive" },
  ],
  IN_REVIEW: [
    { status: "PUBLISHED", label: "Publish" },
    { status: "DRAFT", label: "Back to draft" },
  ],
  PUBLISHED: [
    { status: "DRAFT", label: "Unpublish" },
    { status: "ARCHIVED", label: "Archive" },
  ],
  ARCHIVED: [{ status: "DRAFT", label: "Restore to draft" }],
};

async function Detail({ params, searchParams }: PageProps<"/admin/design/[id]">) {
  const user = await requirePermission("content.view");
  const { id } = await params;
  const query = await searchParams;
  const [question, { tracks }] = await Promise.all([
    getAdminDesignQuestion(id),
    designFormOptions(),
  ]);
  if (!question) notFound();
  const canEdit = can(user.roles, "content.edit") && question.status !== "ARCHIVED";
  const canPublish = can(user.roles, "content.publish");

  return (
    <div className="space-y-6">
      <PageHeader
        title={question.title}
        description={`${question.externalId} · ${DESIGN_KIND_LABELS[question.kind]}`}
        actions={
          <>
            <ContentStatusBadge status={question.status} />
            {question.status === "PUBLISHED" ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/design/${question.slug}`}>
                  <ExternalLink /> Open as student
                </Link>
              </Button>
            ) : null}
          </>
        }
      />
      {/* Written for a company (D-067): back to its interview questions, or the next one. */}
      {question.companies.slice(0, 3).map((slug) => (
        <div key={slug} className="flex flex-wrap items-center gap-2 text-sm">
          <Button asChild variant="outline" size="sm">
            <Link href={companyTabHref(slug, "interview")}>Back to {slug}</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/design/new?company=${slug}&kind=${question.kind}`}>
              <Plus /> Add another for {slug}
            </Link>
          </Button>
        </div>
      ))}
      {query.created || query.saved ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>
            {query.published
              ? "Saved and published"
              : query.created
                ? "Created as a draft"
                : "Saved"}
          </AlertTitle>
          {query.draft ? (
            <AlertDescription>
              The question went back to draft and is hidden from students until it&apos;s published
              again.
            </AlertDescription>
          ) : null}
        </Alert>
      ) : null}
      {canPublish ? (
        <div className="flex flex-wrap gap-2">
          {STATUS_BUTTONS[question.status].map((b) => (
            <form key={b.status} action={setDesignStatusAction}>
              <input type="hidden" name="id" value={question.id} />
              <input type="hidden" name="status" value={b.status} />
              <input type="hidden" name="back" value="detail" />
              <Button
                type="submit"
                variant={
                  b.status === "PUBLISHED"
                    ? "default"
                    : b.status === "ARCHIVED"
                      ? "destructive"
                      : "outline"
                }
              >
                {b.label}
              </Button>
            </form>
          ))}
        </div>
      ) : null}
      <Card>
        <CardContent>
          <DesignForm
            canEdit={canEdit}
            tracks={tracks}
            values={{
              id: question.id,
              externalId: question.externalId,
              slug: question.slug,
              kind: question.kind,
              title: question.title,
              difficulty: question.difficulty,
              prompt: question.prompt,
              requirements: question.requirements,
              approach: question.approach,
              tradeoffs: question.tradeoffs,
              followUps: question.followUps ?? "",
              companies: question.companies,
              tracks: question.tracks,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
