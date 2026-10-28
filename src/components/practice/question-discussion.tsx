"use client";

import {
  ChevronDown,
  Flag,
  MessageSquare,
  MoreHorizontal,
  Reply,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  deleteCommentAction,
  flagCommentAction,
  loadDiscussionAction,
  postCommentAction,
  voteCommentAction,
} from "@/app/(student)/practice/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { COMMENT_MAX, FLAG_REASONS, type FlagReason } from "@/lib/community/comments";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CommentView, DiscussionView } from "@/server/services/discussions";

type Comment = Omit<CommentView, "replies">;

function ago(date: Date) {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return formatDate(new Date(date));
}

function CommentForm({
  questionId,
  parentId,
  placeholder,
  onPosted,
  autoFocus,
}: {
  questionId: string;
  parentId?: string;
  placeholder: string;
  onPosted: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await postCommentAction({ questionId, body, parentId });
          if (!result.ok) return setError(result.error);
          setBody("");
          setError(null);
          onPosted();
        });
      }}
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        rows={parentId ? 2 : 3}
        maxLength={COMMENT_MAX}
        autoFocus={autoFocus}
        data-testid={parentId ? "reply-input" : "comment-input"}
      />
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          Be kind and explain your reasoning. No links or contact details.
        </p>
        <Button type="submit" size="sm" disabled={pending || body.trim().length < 3}>
          {pending ? "Posting…" : parentId ? "Reply" : "Post"}
        </Button>
      </div>
    </form>
  );
}

function CommentItem({
  comment,
  questionId,
  onChange,
  canReply,
  canPost,
}: {
  comment: Comment;
  questionId: string;
  onChange: () => void;
  canReply: boolean;
  canPost: boolean;
}) {
  const [votes, setVotes] = useState({ count: comment.voteCount, voted: comment.voted });
  const [replying, setReplying] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2" data-testid="comment">
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{comment.mine ? "You" : comment.author}</span>{" "}
        · {ago(comment.createdAt)}
      </p>
      <p className="text-sm break-words whitespace-pre-wrap">{comment.body}</p>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={votes.voted}
          disabled={comment.mine || pending}
          aria-label={`Helpful (${votes.count})`}
          onClick={() =>
            startTransition(async () => {
              const result = await voteCommentAction(comment.id);
              if (!result.ok) return void toast.error(result.error);
              setVotes({ count: result.voteCount, voted: result.voted });
            })
          }
        >
          <ThumbsUp className={cn(votes.voted && "fill-current text-primary")} />
          <span className="tabular">{votes.count}</span>
        </Button>
        {canReply && canPost ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setReplying((r) => !r)}>
            <Reply /> Reply
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="icon" aria-label="More">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {comment.mine ? (
              <DropdownMenuItem
                onSelect={() =>
                  startTransition(async () => {
                    const result = await deleteCommentAction(comment.id);
                    if (result.ok) onChange();
                    else toast.error(result.error);
                  })
                }
              >
                <Trash2 /> Delete
              </DropdownMenuItem>
            ) : comment.flagged ? (
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                You reported this
              </DropdownMenuLabel>
            ) : (
              <>
                <DropdownMenuLabel className="flex items-center gap-1.5">
                  <Flag className="size-3.5" /> Report
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(Object.entries(FLAG_REASONS) as [FlagReason, string][]).map(([reason, label]) => (
                  <DropdownMenuItem
                    key={reason}
                    onSelect={() =>
                      startTransition(async () => {
                        const result = await flagCommentAction(comment.id, reason);
                        if (!result.ok) return void toast.error(result.error);
                        toast.success("Thanks. A moderator will check it.");
                        onChange();
                      })
                    }
                  >
                    {label}
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {replying ? (
        <CommentForm
          questionId={questionId}
          parentId={comment.id}
          placeholder="Write a reply"
          autoFocus
          onPosted={() => {
            setReplying(false);
            onChange();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Discussion under a question (D-048). Loads only when opened and only after the student has
 * answered, so it never spoils the answer.
 */
export function QuestionDiscussion({ questionId }: { questionId: string }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<DiscussionView | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => setView(await loadDiscussionAction(questionId)));
  }, [questionId]);

  useEffect(() => {
    if (open && !view) load();
  }, [open, view, load]);

  const total = view?.status === "open" ? view.total : null;

  return (
    <div className="rounded-xl border">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        data-testid="discussion-toggle"
      >
        <MessageSquare className="size-4 text-muted-foreground" aria-hidden="true" />
        Discussion{total !== null ? ` (${total})` : ""}
        <ChevronDown
          className={cn("ml-auto size-4 transition-transform", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="space-y-5 border-t px-4 py-4" aria-busy={pending}>
          {!view ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : view.status === "locked" ? (
            <p className="text-sm text-muted-foreground">
              Answer the question to see the discussion.
            </p>
          ) : (
            <>
              {view.canPost ? (
                <CommentForm
                  questionId={questionId}
                  placeholder="Share a shortcut, a doubt or another way to solve it"
                  onPosted={load}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  A moderator has turned off posting for your account.
                </p>
              )}
              {view.comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No comments yet. Start the discussion.
                </p>
              ) : (
                <ul className="space-y-5">
                  {view.comments.map((comment) => (
                    <li key={comment.id} className="space-y-3">
                      <CommentItem
                        comment={comment}
                        questionId={questionId}
                        onChange={load}
                        canReply
                        canPost={view.canPost}
                      />
                      {comment.replies.length ? (
                        <ul className="space-y-4 border-l-2 pl-4">
                          {comment.replies.map((reply) => (
                            <li key={reply.id}>
                              <CommentItem
                                comment={reply}
                                questionId={questionId}
                                onChange={load}
                                canReply={false}
                                canPost={view.canPost}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
