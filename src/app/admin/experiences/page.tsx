import type { Metadata } from "next";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CircleAlert } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import {
  listForModeration,
  moderateExperience,
  RESULT_LABELS,
} from "@/server/services/experiences";

export const metadata: Metadata = { title: "Interview experiences" };

async function moderateAction(formData: FormData) {
  "use server";
  const actor = await requirePermission("experiences.moderate");
  const decision = z.enum(["approve", "reject"]).parse(formData.get("decision"));
  const result = await moderateExperience(
    z.string().max(40).parse(formData.get("id")),
    decision,
    actor,
    {
      rounds: String(formData.get("rounds") ?? "").trim() || undefined,
      questions: String(formData.get("questions") ?? "").trim() || undefined,
      tips: String(formData.get("tips") ?? "").trim() || null,
    },
    String(formData.get("note") ?? ""),
  );
  revalidatePath("/admin/experiences");
  if (result.ok) revalidatePath(`/companies/${result.companySlug}/experiences`);
  else redirect(`/admin/experiences?error=${encodeURIComponent(result.error)}`);
}

export default function ExperiencesAdminPage({ searchParams }: PageProps<"/admin/experiences">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Interview experiences"
        description="Check each experience before it goes live: remove personal details and anything copied from a paid test, fix formatting."
      />
      <Suspense fallback={<TableSkeleton rows={4} />}>
        <Queue searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Queue({
  searchParams,
}: {
  searchParams: PageProps<"/admin/experiences">["searchParams"];
}) {
  await requirePermission("experiences.moderate");
  const { error } = await searchParams;
  const pending = await listForModeration("PENDING");
  return (
    <div className="space-y-4">
      {typeof error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {pending.length === 0 ? (
        <EmptyState title="Nothing to review" description="New experiences appear here." />
      ) : null}
      {pending.map((x) => (
        <Card key={x.id} data-testid="pending-experience">
          <CardHeader>
            <CardTitle>
              <h2 className="text-base">
                {x.company.name} · {x.role} · {x.year}
              </h2>
            </CardTitle>
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">{x.profileType.toLowerCase()}</Badge>
              <Badge variant="outline">{RESULT_LABELS[x.result]}</Badge>
              <span className="text-muted-foreground">
                {x.user.name} ({x.user.email}) · {x.anonymous ? "anonymous" : "named"} ·{" "}
                {formatDate(x.createdAt)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <form action={moderateAction} className="space-y-3">
              <input type="hidden" name="id" value={x.id} />
              <div className="space-y-1.5">
                <Label htmlFor={`rounds-${x.id}`}>Rounds</Label>
                <Textarea id={`rounds-${x.id}`} name="rounds" rows={5} defaultValue={x.rounds} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`questions-${x.id}`}>Questions</Label>
                <Textarea
                  id={`questions-${x.id}`}
                  name="questions"
                  rows={4}
                  defaultValue={x.questions}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`tips-${x.id}`}>Tips</Label>
                <Textarea id={`tips-${x.id}`} name="tips" rows={2} defaultValue={x.tips ?? ""} />
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-56 flex-1 space-y-1.5">
                  <Label htmlFor={`note-${x.id}`}>
                    Note to the contributor (required to reject)
                  </Label>
                  <Input id={`note-${x.id}`} name="note" maxLength={300} />
                </div>
                <Button
                  type="submit"
                  name="decision"
                  value="approve"
                  data-testid="approve-experience"
                >
                  Approve with edits
                </Button>
                <Button type="submit" name="decision" value="reject" variant="outline">
                  Reject
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
