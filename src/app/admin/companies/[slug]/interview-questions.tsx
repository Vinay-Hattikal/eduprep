import Link from "next/link";
import { CheckCircle2, Plus, Upload } from "lucide-react";
import { setLinkRoundAction } from "@/app/admin/companies/content-actions";
import { LinkExistingCard, UnlinkButton } from "@/app/admin/companies/[slug]/link-parts";
import { EmptyState } from "@/components/shared/empty-state";
import { ContentStatusBadge, DifficultyLabel } from "@/components/shared/status-badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { DesignKind } from "@/generated/prisma/enums";
import {
  companyImportHref,
  INTERVIEW_ROUND_TYPES,
  ROUND_TYPE_LABELS,
} from "@/lib/content/companies";
import { DESIGN_KIND_LABELS, kindForRound } from "@/lib/content/design";
import { db } from "@/server/db";
import { searchLinkable } from "@/server/services/company-links";
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
  const unassigned = links.filter((l) => !rounds.some((r) => r.id === l.roundId));
  const groups: {
    key: string;
    title: string;
    subtitle: string | null;
    addKinds: DesignKind[];
    links: typeof links;
  }[] = rounds.map((r) => ({
    key: r.id,
    title: `Round ${r.order}: ${r.name}`,
    subtitle: ROUND_TYPE_LABELS[r.type],
    addKinds: [kindForRound(r.type)],
    links: links.filter((l) => l.roundId === r.id),
  }));
  // Questions not tied to a round; the whole list when the company has no interview rounds.
  if (unassigned.length || !rounds.length)
    groups.push({
      key: "none",
      title: rounds.length ? "Not tied to a round" : "Interview questions",
      subtitle: rounds.length ? "Pick the round each one is asked in." : null,
      addKinds: rounds.length ? [] : ["TECHNICAL", "HR"],
      links: unassigned,
    });

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">
          Technical, HR and design questions asked in {company.name}&apos;s interviews, by round.
          {rounds.length
            ? ""
            : " Add the interview rounds on the Hiring process tab to group them."}
        </p>
        {canEdit ? (
          <Button asChild variant="outline" size="sm">
            <Link href={companyImportHref(company.slug)}>
              <Upload /> Import
            </Link>
          </Button>
        ) : null}
      </div>

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
            {canEdit && group.addKinds.length ? (
              <div className="flex flex-wrap gap-2">
                {group.addKinds.map((kind) => (
                  <Button key={kind} asChild size="sm" variant="outline">
                    <Link href={`/admin/design/new?company=${company.slug}&kind=${kind}`}>
                      <Plus /> Add {kind === "HR" ? "HR" : "technical"} question
                    </Link>
                  </Button>
                ))}
              </div>
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
                      {canEdit && rounds.length ? (
                        <form action={setLinkRoundAction} className="flex items-center gap-1">
                          <input type="hidden" name="slug" value={company.slug} />
                          <input type="hidden" name="companyId" value={company.id} />
                          <input type="hidden" name="linkId" value={link.id} />
                          <NativeSelect
                            name="round"
                            size="sm"
                            defaultValue={link.roundId ?? ""}
                            aria-label={`Round for ${item.externalId}`}
                          >
                            <NativeSelectOption value="">No round</NativeSelectOption>
                            {rounds.map((r) => (
                              <NativeSelectOption key={r.id} value={r.id}>
                                Round {r.order}: {r.name}
                              </NativeSelectOption>
                            ))}
                          </NativeSelect>
                          <Button type="submit" size="sm" variant="ghost">
                            Move
                          </Button>
                        </form>
                      ) : null}
                      {canEdit ? (
                        <UnlinkButton
                          company={company}
                          kind="design"
                          linkId={link.id}
                          label={item.externalId}
                        />
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
        <LinkExistingCard
          company={company}
          kind="design"
          tab="interview"
          title="Link an existing question"
          description="Already in the design and interview bank? Link it instead of writing it again."
          placeholder="Search by ID or title"
          q={q}
          results={results.map((r) => ({ ...r, label: "title" in r ? r.title : r.text }))}
        />
      ) : null}
    </div>
  );
}
