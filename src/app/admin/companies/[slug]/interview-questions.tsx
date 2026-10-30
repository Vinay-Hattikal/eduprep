import Link from "next/link";
import { CheckCircle2, Link2, Link2Off, Plus, Search } from "lucide-react";
import {
  linkItemAction,
  setLinkRoundAction,
  unlinkItemAction,
} from "@/app/admin/companies/content-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { ContentStatusBadge, DifficultyLabel } from "@/components/shared/status-badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { INTERVIEW_ROUND_TYPES, ROUND_TYPE_LABELS } from "@/lib/content/companies";
import { db } from "@/server/db";
import { searchLinkable } from "@/server/services/company-links";
import { DESIGN_KIND_LABELS } from "@/server/services/tracks";
import type { getCompanyBySlug } from "@/server/services/companies";

type Company = NonNullable<Awaited<ReturnType<typeof getCompanyBySlug>>>;

/**
 * A company's interview questions (D-067): technical, HR and design questions, grouped by the
 * interview round they're asked in. Each lives once in the design bank and can be linked to many
 * companies.
 */
export async function InterviewQuestions({
  company,
  canEdit,
  query,
}: {
  company: Company;
  canEdit: boolean;
  query: Record<string, string | string[] | undefined>;
}) {
  const q = typeof query.q === "string" ? query.q.slice(0, 100) : "";
  const [links, results] = await Promise.all([
    db.companyItem.findMany({
      where: { companyId: company.id, designQuestionId: { not: null } },
      include: {
        designQuestion: {
          select: {
            id: true,
            externalId: true,
            title: true,
            kind: true,
            status: true,
            difficulty: true,
          },
        },
      },
      orderBy: { designQuestion: { externalId: "asc" } },
    }),
    canEdit && q ? searchLinkable(company.id, "design", q) : [],
  ]);
  const rounds = company.rounds.filter((r) => INTERVIEW_ROUND_TYPES.includes(r.type));
  const groups = [
    ...rounds.map((r) => ({
      key: String(r.order),
      title: `Round ${r.order}: ${r.name}`,
      subtitle: ROUND_TYPE_LABELS[r.type],
      kind: r.type === "HR_INTERVIEW" ? "HR" : "TECHNICAL",
      links: links.filter((l) => l.roundOrder === r.order),
    })),
    {
      key: "none",
      title: rounds.length ? "Not tied to a round" : "Interview questions",
      subtitle: rounds.length ? "Pick the round each one is asked in." : null,
      kind: "TECHNICAL",
      links: links.filter((l) => !rounds.some((r) => r.order === l.roundOrder)),
    },
  ].filter((g) => g.key !== "none" || g.links.length || !rounds.length);

  return (
    <div className="space-y-6">
      {query.linked || query.unlinked || query.round ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>
            {query.linked
              ? "Linked"
              : query.round
                ? "Round updated"
                : "Unlinked (the question itself is kept)"}
          </AlertTitle>
        </Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Technical, HR and design questions asked in {company.name}&apos;s interviews, by round.
        {rounds.length ? "" : " Add the interview rounds on the Hiring process tab to group them."}
      </p>

      {groups.map((group) => (
        <Card key={group.key} data-testid={`interview-round-${group.key}`}>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>
                <h2>
                  {group.title}{" "}
                  <span className="font-normal text-muted-foreground">({group.links.length})</span>
                </h2>
              </CardTitle>
              {group.subtitle ? <CardDescription>{group.subtitle}</CardDescription> : null}
            </div>
            {canEdit && group.key !== "none" ? (
              <Button asChild size="sm" variant="outline">
                <Link href={`/admin/design/new?company=${company.slug}&kind=${group.kind}`}>
                  <Plus /> Add {group.kind === "HR" ? "HR" : "technical"} question
                </Link>
              </Button>
            ) : null}
          </CardHeader>
          <CardContent>
            {group.links.length === 0 ? (
              <EmptyState
                title="No questions yet"
                description="Add one, or link an existing question below and pick this round."
              />
            ) : (
              <ul className="divide-y rounded-lg border">
                {group.links.map((link) => {
                  const item = link.designQuestion!;
                  return (
                    <li
                      key={link.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm"
                    >
                      <Link
                        href={`/admin/design/${item.id}`}
                        className="font-mono text-xs font-medium text-primary hover:underline"
                      >
                        {item.externalId}
                      </Link>
                      <span className="min-w-0 flex-1 basis-48 truncate">{item.title}</span>
                      <Badge variant="secondary">{DESIGN_KIND_LABELS[item.kind]}</Badge>
                      <DifficultyLabel difficulty={item.difficulty} />
                      <ContentStatusBadge status={item.status} />
                      {canEdit ? (
                        <>
                          {rounds.length ? (
                            <form action={setLinkRoundAction} className="flex items-center gap-1">
                              <input type="hidden" name="slug" value={company.slug} />
                              <input type="hidden" name="companyId" value={company.id} />
                              <input type="hidden" name="linkId" value={link.id} />
                              <NativeSelect
                                name="round"
                                size="sm"
                                defaultValue={link.roundOrder ? String(link.roundOrder) : ""}
                                aria-label={`Round for ${item.externalId}`}
                              >
                                <NativeSelectOption value="">No round</NativeSelectOption>
                                {rounds.map((r) => (
                                  <NativeSelectOption key={r.id} value={String(r.order)}>
                                    Round {r.order}: {r.name}
                                  </NativeSelectOption>
                                ))}
                              </NativeSelect>
                              <Button type="submit" size="sm" variant="ghost">
                                Move
                              </Button>
                            </form>
                          ) : null}
                          <form action={unlinkItemAction}>
                            <input type="hidden" name="slug" value={company.slug} />
                            <input type="hidden" name="kind" value="design" />
                            <input type="hidden" name="linkId" value={link.id} />
                            <Button
                              type="submit"
                              variant="ghost"
                              size="icon"
                              aria-label={`Unlink ${item.externalId}`}
                              title="Unlink from this company"
                            >
                              <Link2Off />
                            </Button>
                          </form>
                        </>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Link an existing question</h2>
            </CardTitle>
            <CardDescription>
              Already in the design and interview bank? Link it instead of writing it again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              className="flex flex-wrap gap-2"
              role="search"
              aria-label="Search interview questions"
            >
              <input type="hidden" name="tab" value="interview" />
              <div className="relative min-w-48 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  name="q"
                  defaultValue={q}
                  placeholder="Search by ID or title"
                  aria-label="Search by ID or title"
                  className="pl-8"
                />
              </div>
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </form>
            {q ? (
              results.length ? (
                <ul className="divide-y rounded-lg border">
                  {results.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm"
                    >
                      <span className="font-mono text-xs">{r.externalId}</span>
                      <span className="min-w-0 flex-1 basis-48 truncate">
                        {"title" in r ? r.title : r.externalId}
                      </span>
                      <ContentStatusBadge status={r.status} />
                      <form action={linkItemAction}>
                        <input type="hidden" name="slug" value={company.slug} />
                        <input type="hidden" name="companyId" value={company.id} />
                        <input type="hidden" name="kind" value="design" />
                        <input type="hidden" name="itemId" value={r.id} />
                        <input type="hidden" name="q" value={q} />
                        <Button type="submit" size="sm" variant="outline">
                          <Link2 /> Link
                        </Button>
                      </form>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Nothing found that isn&apos;t already linked.
                </p>
              )
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
