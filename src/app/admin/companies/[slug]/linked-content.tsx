import Link from "next/link";
import { CheckCircle2, Plus, Upload } from "lucide-react";
import { LinkExistingCard, UnlinkButton } from "@/app/admin/companies/[slug]/link-parts";
import { EmptyState } from "@/components/shared/empty-state";
import { ContentStatusBadge, DifficultyLabel } from "@/components/shared/status-badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { companyImportHref } from "@/lib/content/companies";
import { plainExcerpt } from "@/lib/format";
import { searchLinkable } from "@/server/services/company-links";
import { db } from "@/server/db";

type Kind = "question" | "problem";

const LABELS = {
  question: {
    title: "MCQ questions",
    one: "question",
    add: "Add question",
    addHref: (slug: string) => `/admin/questions/new?company=${slug}`,
    search: "Search questions by ID or text",
  },
  problem: {
    title: "Coding problems",
    one: "problem",
    add: "Add coding problem",
    addHref: (slug: string) => `/admin/problems/new?company=${slug}`,
    search: "Search problems by ID or title",
  },
} as const;

/**
 * A company's questions or coding problems (D-057): add new ones already tagged with the
 * company, link ones written for other companies, unlink.
 */
export async function LinkedContent({
  kind,
  company,
  canEdit,
  query,
}: {
  kind: Kind;
  company: { id: string; slug: string; name: string };
  canEdit: boolean;
  query: Record<string, string | string[] | undefined>;
}) {
  const labels = LABELS[kind];
  const q = typeof query.q === "string" ? query.q.slice(0, 100) : "";
  const subject = typeof query.subject === "string" ? query.subject : "";

  const [links, subjects, results] = await Promise.all([
    db.companyItem.findMany({
      where: {
        companyId: company.id,
        ...(kind === "question"
          ? {
              questionId: { not: null },
              ...(subject && { question: { subject: { slug: subject } } }),
            }
          : { problemId: { not: null } }),
      },
      include: {
        question: {
          select: {
            id: true,
            externalId: true,
            text: true,
            status: true,
            difficulty: true,
            subject: { select: { name: true } },
            topic: { select: { name: true } },
            passage: { select: { externalId: true } },
          },
        },
        problem: {
          select: { id: true, externalId: true, title: true, status: true, difficulty: true },
        },
      },
    }),
    kind === "question"
      ? db.subject.findMany({ orderBy: { order: "asc" }, select: { slug: true, name: true } })
      : [],
    canEdit && q ? searchLinkable(company.id, kind, q) : [],
  ]);
  // Questions on the same passage sit together (D-067), then the rest, by ID within each.
  const sortKey = (l: (typeof links)[number]) =>
    `${l.question?.passage ? 0 : 1}|${l.question?.passage?.externalId ?? ""}|${l.question?.externalId ?? l.problem?.externalId ?? ""}`;
  links.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));

  return (
    <div className="space-y-6">
      {query.linked || query.unlinked ? (
        <Alert>
          <CheckCircle2 />
          <AlertTitle>{query.linked ? "Linked" : "Unlinked (the item itself is kept)"}</AlertTitle>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>
              <h2>
                {labels.title}{" "}
                <span className="font-normal text-muted-foreground">({links.length})</span>
              </h2>
            </CardTitle>
            <CardDescription>
              Asked at {company.name}. Each {labels.one} lives once in the bank and can be linked to
              many companies.
            </CardDescription>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={companyImportHref(company.slug)}>
                  <Upload /> Import
                </Link>
              </Button>
              <Button asChild data-testid={`add-${kind}`}>
                <Link href={labels.addHref(company.slug)}>
                  <Plus /> {labels.add}
                </Link>
              </Button>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {kind === "question" && subjects.length ? (
            <form className="flex flex-wrap items-end gap-2" aria-label="Filter by subject">
              <input type="hidden" name="tab" value="questions" />
              <NativeSelect name="subject" defaultValue={subject} aria-label="Subject" size="sm">
                <NativeSelectOption value="">All subjects</NativeSelectOption>
                {subjects.map((s) => (
                  <NativeSelectOption key={s.slug} value={s.slug}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Button type="submit" size="sm" variant="secondary">
                Filter
              </Button>
            </form>
          ) : null}
          {links.length === 0 ? (
            <EmptyState
              title={`No ${labels.one}s linked yet`}
              description={`Use “${labels.add}” to write one, or link an existing one below.`}
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {links.map((link) => {
                const item = link.question ?? link.problem;
                if (!item) return null;
                const href = link.question
                  ? `/admin/questions/${item.id}`
                  : `/admin/problems/${item.id}`;
                return (
                  <li
                    key={link.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm"
                  >
                    <Link
                      href={href}
                      className="font-mono text-xs font-medium text-primary hover:underline"
                    >
                      {item.externalId}
                    </Link>
                    <span className="min-w-0 flex-1 basis-48 truncate">
                      {link.question ? plainExcerpt(link.question.text, 120) : link.problem!.title}
                    </span>
                    {link.question ? (
                      <span className="hidden text-xs text-muted-foreground md:inline">
                        {link.question.subject.name} › {link.question.topic.name}
                      </span>
                    ) : null}
                    {link.question?.passage ? (
                      <Badge variant="outline" className="font-mono" title="Passage">
                        {link.question.passage.externalId}
                      </Badge>
                    ) : null}
                    <DifficultyLabel difficulty={item.difficulty} />
                    <ContentStatusBadge status={item.status} />
                    {link.askedIn.length ? (
                      <Badge variant="outline" className="tabular">
                        {link.askedIn.slice(0, 3).join(", ")}
                        {link.askedIn.length > 3 ? "…" : ""}
                      </Badge>
                    ) : null}
                    {canEdit ? (
                      <UnlinkButton
                        company={company}
                        kind={kind}
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

      {canEdit ? (
        <LinkExistingCard
          company={company}
          kind={kind}
          tab={kind === "question" ? "questions" : "coding"}
          title={`Link an existing ${labels.one}`}
          description="Already written for another company or practice? Link it instead of writing it again."
          placeholder={labels.search}
          q={q}
          results={results.map((r) => ({
            ...r,
            label: "text" in r ? plainExcerpt(r.text, 120) : r.title,
          }))}
        />
      ) : null}
    </div>
  );
}
