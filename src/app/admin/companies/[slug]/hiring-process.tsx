import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { hiringChangeAction } from "@/app/admin/companies/hiring-actions";
import { RoundForm, SectionForm } from "@/app/admin/companies/hiring-forms";
import { EmptyState } from "@/components/shared/empty-state";
import type { TopicOptions } from "@/components/shared/topic-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROUND_TYPE_LABELS } from "@/lib/content/companies";
import { PLATFORMS } from "@/server/imports/definitions/company-details";
import type { getCompanyBySlug } from "@/server/services/companies";

type Company = NonNullable<Awaited<ReturnType<typeof getCompanyBySlug>>>;

/** A small button that deletes or moves a round, section or source. */
export function ChangeButton({
  slug,
  op,
  id,
  label,
  disabled,
}: {
  slug: string;
  op: string;
  id: string;
  label: string;
  disabled?: boolean;
}) {
  const icon = op.endsWith("up") ? <ArrowUp /> : op.endsWith("down") ? <ArrowDown /> : <Trash2 />;
  return (
    <form action={hiringChangeAction}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="op" value={op} />
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        aria-label={label}
        title={label}
        disabled={disabled}
        className={op.endsWith("delete") ? "text-destructive" : undefined}
      >
        {icon}
      </Button>
    </form>
  );
}

/** The company's rounds and their test sections, with editors when allowed. */
export function HiringProcess({
  company,
  canEdit,
  topics,
}: {
  company: Company;
  canEdit: boolean;
  topics: TopicOptions;
}) {
  const rounds = company.rounds;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Rounds in order, and the test sections inside each round. Mock tests are drafted from these
        sections. Changes show on the public company page straight away.
      </p>
      {rounds.length === 0 ? (
        <EmptyState title="No rounds yet" description="Add the first round below." />
      ) : (
        <ol className="space-y-4">
          {rounds.map((round, ri) => (
            <li key={round.id}>
              <Card>
                <CardHeader className="gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="tabular flex size-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {round.order}
                    </span>
                    <CardTitle className="text-base">
                      <h2>{round.name}</h2>
                    </CardTitle>
                    <Badge variant="secondary">{ROUND_TYPE_LABELS[round.type]}</Badge>
                    {round.platform ? <Badge variant="outline">{round.platform}</Badge> : null}
                    {round.durationMin ? (
                      <span className="text-sm text-muted-foreground">{round.durationMin} min</span>
                    ) : null}
                    {round.isElimination ? <Badge variant="outline">Elimination</Badge> : null}
                    {canEdit ? (
                      <div className="ml-auto flex">
                        <ChangeButton
                          slug={company.slug}
                          op="round-up"
                          id={round.id}
                          label={`Move ${round.name} up`}
                          disabled={ri === 0}
                        />
                        <ChangeButton
                          slug={company.slug}
                          op="round-down"
                          id={round.id}
                          label={`Move ${round.name} down`}
                          disabled={ri === rounds.length - 1}
                        />
                        <ChangeButton
                          slug={company.slug}
                          op="round-delete"
                          id={round.id}
                          label={`Delete ${round.name}`}
                        />
                      </div>
                    ) : null}
                  </div>
                  {round.description ? (
                    <CardDescription>{round.description}</CardDescription>
                  ) : null}
                </CardHeader>
                <CardContent className="space-y-3">
                  {round.sections.length ? (
                    <ol className="divide-y rounded-lg border">
                      {round.sections.map((section, si) => (
                        <li key={section.id} className="p-3 text-sm">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-medium">{section.name}</span>
                            <span className="tabular text-muted-foreground">
                              {section.questionCount}{" "}
                              {section.type === "CODING" ? "problems" : "questions"} ·{" "}
                              {section.minutes} min
                              {section.negativeMarks ? ` · −${section.negativeMarks}` : ""}
                              {section.canGoBack ? "" : " · no going back"}
                            </span>
                            {canEdit ? (
                              <div className="ml-auto flex">
                                <ChangeButton
                                  slug={company.slug}
                                  op="section-up"
                                  id={section.id}
                                  label={`Move ${section.name} up`}
                                  disabled={si === 0}
                                />
                                <ChangeButton
                                  slug={company.slug}
                                  op="section-down"
                                  id={section.id}
                                  label={`Move ${section.name} down`}
                                  disabled={si === round.sections.length - 1}
                                />
                                <ChangeButton
                                  slug={company.slug}
                                  op="section-delete"
                                  id={section.id}
                                  label={`Delete ${section.name}`}
                                />
                              </div>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {section.topics.map((t) => t.name).join(", ")}
                          </p>
                          {canEdit ? (
                            <details className="mt-2">
                              <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-primary">
                                <Pencil className="size-3" aria-hidden="true" /> Edit section
                              </summary>
                              <div className="mt-3">
                                <SectionForm
                                  roundId={round.id}
                                  topics={topics}
                                  values={{
                                    id: section.id,
                                    name: section.name,
                                    type: section.type,
                                    questionCount: section.questionCount,
                                    minutes: section.minutes,
                                    negativeMarks: section.negativeMarks,
                                    canGoBack: section.canGoBack,
                                    topicIds: section.topics.map((t) => t.id),
                                  }}
                                />
                              </div>
                            </details>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No test sections. Interview rounds usually have none.
                    </p>
                  )}
                  {canEdit ? (
                    <div className="space-y-2">
                      <details>
                        <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary">
                          <Plus className="size-4" aria-hidden="true" /> Add section
                        </summary>
                        <div className="mt-3 rounded-lg border border-dashed p-4">
                          <SectionForm roundId={round.id} topics={topics} />
                        </div>
                      </details>
                      <details>
                        <summary className="inline-flex cursor-pointer items-center gap-1 text-sm font-medium text-primary">
                          <Pencil className="size-4" aria-hidden="true" /> Edit round details
                        </summary>
                        <div className="mt-3 rounded-lg border border-dashed p-4">
                          <RoundForm
                            companyId={company.id}
                            platforms={PLATFORMS}
                            values={{
                              id: round.id,
                              name: round.name,
                              type: round.type,
                              platform: round.platform,
                              durationMin: round.durationMin,
                              isElimination: round.isElimination,
                              description: round.description,
                            }}
                          />
                        </div>
                      </details>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
      {canEdit ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <h2>Add a round</h2>
            </CardTitle>
            <CardDescription>It goes at the end. Use the arrows to reorder.</CardDescription>
          </CardHeader>
          <CardContent>
            <RoundForm companyId={company.id} platforms={PLATFORMS} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
