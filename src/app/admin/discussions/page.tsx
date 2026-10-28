import type { Metadata } from "next";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CircleAlert, Flag, ThumbsUp } from "lucide-react";
import { z } from "zod";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FLAG_REASONS, type FlagReason } from "@/lib/community/comments";
import { formatDateTime, plainExcerpt } from "@/lib/format";
import { requirePermission } from "@/server/auth";
import {
  listForModeration,
  moderateComment,
  setCommentBlock,
  type ModerationFilter,
} from "@/server/services/discussions";

export const metadata: Metadata = { title: "Discussions" };

const TABS: Record<ModerationFilter, string> = {
  flagged: "Flagged",
  recent: "Newest",
  hidden: "Hidden",
};

async function moderateAction(formData: FormData) {
  "use server";
  const actor = await requirePermission("discussions.moderate");
  const id = z.string().max(40).parse(formData.get("id"));
  const tab = String(formData.get("tab") ?? "flagged");
  const decision = z.enum(["keep", "hide", "block", "unblock"]).parse(formData.get("decision"));
  let error: string | null = null;
  if (decision === "block" || decision === "unblock") {
    await setCommentBlock(
      z.string().max(40).parse(formData.get("userId")),
      decision === "block",
      actor,
    );
  } else {
    const result = await moderateComment(id, decision, actor, String(formData.get("reason") ?? ""));
    if (!result.ok) error = result.error;
  }
  revalidatePath("/admin/discussions");
  redirect(`/admin/discussions?tab=${tab}${error ? `&error=${encodeURIComponent(error)}` : ""}`);
}

export default function DiscussionsPage({ searchParams }: PageProps<"/admin/discussions">) {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Discussions"
        description="Comments go live at once. Students flag problems; enough flags hide a comment until you decide."
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
  searchParams: PageProps<"/admin/discussions">["searchParams"];
}) {
  await requirePermission("discussions.moderate");
  const query = await searchParams;
  const tab: ModerationFilter =
    typeof query.tab === "string" && query.tab in TABS
      ? (query.tab as ModerationFilter)
      : "flagged";
  const comments = await listForModeration(tab);

  return (
    <div className="space-y-4">
      <nav aria-label="Views" className="flex gap-1">
        {(Object.keys(TABS) as ModerationFilter[]).map((t) => (
          <Button key={t} asChild size="sm" variant={t === tab ? "secondary" : "ghost"}>
            <Link
              href={`/admin/discussions?tab=${t}`}
              aria-current={t === tab ? "page" : undefined}
            >
              {TABS[t]}
            </Link>
          </Button>
        ))}
      </nav>
      {typeof query.error === "string" ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertDescription>{query.error}</AlertDescription>
        </Alert>
      ) : null}
      {comments.length === 0 ? (
        <EmptyState
          title={tab === "flagged" ? "Nothing flagged" : "No comments"}
          description={tab === "flagged" ? "Flagged comments appear here." : undefined}
        />
      ) : null}
      {comments.map((comment) => {
        const reasons = [...new Set(comment.flags.map((f) => f.reason))];
        return (
          <Card key={comment.id} data-testid="moderation-comment">
            <CardHeader className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant={comment.status === "VISIBLE" ? "secondary" : "outline"}>
                  {comment.status === "VISIBLE" ? "Visible" : "Hidden"}
                </Badge>
                {comment.flagCount ? (
                  <Badge variant="outline" className="gap-1 border-destructive/40 text-destructive">
                    <Flag className="size-3" /> {comment.flagCount}:{" "}
                    {reasons.map((r) => FLAG_REASONS[r as FlagReason] ?? r).join(", ")}
                  </Badge>
                ) : null}
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <ThumbsUp className="size-3" /> {comment.voteCount}
                </span>
                <span className="text-muted-foreground">
                  {comment.user.name} ({comment.user.email}) · {formatDateTime(comment.createdAt)}
                  {comment.user.commentsBlockedAt ? " · posting blocked" : ""}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                On <span className="font-mono">{comment.question.externalId}</span>:{" "}
                {plainExcerpt(comment.question.text, 100)}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="rounded-lg bg-muted/50 p-3 text-sm break-words whitespace-pre-wrap">
                {comment.body}
              </p>
              {comment.hiddenReason ? (
                <p className="text-xs text-muted-foreground">Hidden: {comment.hiddenReason}</p>
              ) : null}
              <form action={moderateAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="id" value={comment.id} />
                <input type="hidden" name="userId" value={comment.user.id} />
                <input type="hidden" name="tab" value={tab} />
                <Input
                  name="reason"
                  maxLength={200}
                  placeholder="Reason (needed to hide)"
                  aria-label="Reason"
                  className="min-w-56 flex-1"
                />
                <Button
                  type="submit"
                  name="decision"
                  value="keep"
                  variant="outline"
                  data-testid="keep-comment"
                >
                  {comment.status === "VISIBLE" ? "Keep" : "Restore"}
                </Button>
                {comment.status === "VISIBLE" || comment.moderatedAt === null ? (
                  <Button type="submit" name="decision" value="hide" variant="destructive">
                    Hide
                  </Button>
                ) : null}
                <Button
                  type="submit"
                  name="decision"
                  value={comment.user.commentsBlockedAt ? "unblock" : "block"}
                  variant="ghost"
                >
                  {comment.user.commentsBlockedAt ? "Allow posting again" : "Block posting"}
                </Button>
              </form>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
