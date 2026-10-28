import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, Trash2 } from "lucide-react";
import { deletePassageAction } from "@/app/admin/passages/actions";
import { PassageForm } from "@/app/admin/passages/passage-form";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { plainExcerpt } from "@/lib/format";
import { can } from "@/lib/permissions";
import { requirePermission } from "@/server/auth";
import { getAdminPassage } from "@/server/services/passages";

export const metadata: Metadata = { title: "Passage" };

export default function PassagePage({ params, searchParams }: PageProps<"/admin/passages/[id]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/passages">
          <ArrowLeft /> Passages
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Detail params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Detail({ params, searchParams }: PageProps<"/admin/passages/[id]">) {
  const user = await requirePermission("content.view");
  const { id } = await params;
  const query = await searchParams;
  const passage = await getAdminPassage(id);
  if (!passage) notFound();
  const canEdit = can(user.roles, "content.edit");
  const live = passage.questions.filter((q) => q.status === "PUBLISHED").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={passage.title}
        description={`${passage.externalId} · used by ${passage.questions.length} question${passage.questions.length === 1 ? "" : "s"}`}
        actions={
          canEdit && passage.questions.length === 0 ? (
            <form action={deletePassageAction}>
              <input type="hidden" name="id" value={passage.id} />
              <Button type="submit" variant="outline" size="sm">
                <Trash2 /> Delete
              </Button>
            </form>
          ) : null
        }
      />
      {query.created || query.saved ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{query.created ? "Passage created" : "Saved"}</AlertTitle>
        </Alert>
      ) : null}
      {typeof query.error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardContent>
          <PassageForm
            canEdit={canEdit}
            liveQuestions={live}
            values={{
              id: passage.id,
              externalId: passage.externalId,
              title: passage.title,
              body: passage.body,
            }}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Questions using this passage</h2>
          </CardTitle>
          <CardDescription>
            To link another question, enter {passage.externalId} as its passage ID.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {passage.questions.length ? (
            <ul className="divide-y rounded-lg border">
              {passage.questions.map((q) => (
                <li key={q.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                  <Link
                    href={`/admin/questions/${q.id}`}
                    className="font-mono text-xs text-primary hover:underline"
                  >
                    {q.externalId}
                  </Link>
                  <span className="min-w-0 flex-1 truncate">{plainExcerpt(q.text, 120)}</span>
                  <ContentStatusBadge status={q.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No questions use it yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
