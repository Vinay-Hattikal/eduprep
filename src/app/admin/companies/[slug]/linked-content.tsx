import Link from "next/link";
import { CheckCircle2, Link2, Link2Off, Plus, Search, Upload } from "lucide-react";
import { linkItemAction, unlinkItemAction } from "@/app/admin/companies/content-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { ContentStatusBadge, DifficultyLabel } from "@/components/shared/status-badge";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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
  links.sort((a, b) =>
    (a.question?.externalId ?? a.problem?.externalId ?? "").localeCompare(
      b.question?.externalId ?? b.problem?.externalId ?? "",
    ),
  );

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
                <Link href={`/admin/imports?company=${company.slug}`}>
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
                    <DifficultyLabel difficulty={item.difficulty} />
                    <ContentStatusBadge status={item.status} />
                    {link.askedIn.length ? (
                      <Badge variant="outline" className="tabular">
                        {link.askedIn.slice(0, 3).join(", ")}
                        {link.askedIn.length > 3 ? "…" : ""}
                      </Badge>
                    ) : null}
                    {canEdit ? (
                      <form action={unlinkItemAction}>
                        <input type="hidden" name="slug" value={company.slug} />
                        <input type="hidden" name="kind" value={kind} />
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
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle>
              <h2>Link an existing {labels.one}</h2>
            </CardTitle>
            <CardDescription>
              Already written for another company or practice? Link it instead of writing it again.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex flex-wrap gap-2" role="search" aria-label={labels.search}>
              <input
                type="hidden"
                name="tab"
                value={kind === "question" ? "questions" : "coding"}
              />
              <div className="relative min-w-48 flex-1">
                <Search
                  className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  name="q"
                  defaultValue={q}
                  placeholder={labels.search}
                  aria-label={labels.search}
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
                        {"text" in r ? plainExcerpt(r.text, 120) : r.title}
                      </span>
                      <ContentStatusBadge status={r.status} />
                      <form action={linkItemAction}>
                        <input type="hidden" name="slug" value={company.slug} />
                        <input type="hidden" name="companyId" value={company.id} />
                        <input type="hidden" name="kind" value={kind} />
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
