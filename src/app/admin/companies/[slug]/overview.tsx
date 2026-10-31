import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Rocket } from "lucide-react";
import { publishCompanyContentAction } from "@/app/admin/companies/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { companyImportHref, companyTabHref } from "@/lib/content/companies";
import type { CompanyPublishPlan } from "@/server/services/company-publish";
import type { CompanyReadiness } from "@/server/services/company-readiness";

// The company's Overview tab (D-067): what's done, what's next, and "Publish everything".

/** Progress and the next step, shown above every tab. */
export function CompanyProgress({
  slug,
  readiness,
}: {
  slug: string;
  readiness: CompanyReadiness;
}) {
  const { done, total, next } = readiness;
  return (
    <div className="space-y-2 rounded-xl border bg-surface p-4" data-testid="company-progress">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">
          {done} of {total} done
        </span>
        {next ? (
          <Link
            href={companyTabHref(slug, next.tab)}
            className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline"
            data-testid="next-step"
          >
            <span className="truncate">Next: {next.next}</span>
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>
        ) : (
          <span className="text-success">Everything is in place</span>
        )}
      </div>
      <Progress value={(done / total) * 100} aria-label={`${done} of ${total} done`} />
    </div>
  );
}

export function CompanyOverview({
  company,
  readiness,
  plan,
  canPublish,
}: {
  company: { id: string; slug: string; name: string };
  readiness: CompanyReadiness;
  plan: CompanyPublishPlan;
  canPublish: boolean;
}) {
  const { goLive: n, staysDraft } = plan;
  const goLive = [
    n.questions ? `${n.questions} questions` : null,
    n.problems ? `${n.problems} coding problems` : null,
    n.interviews ? `${n.interviews} interview questions` : null,
    n.company ? "the company" : null,
    n.mocks ? `${n.mocks} mock test${n.mocks === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Checklist</h2>
          </CardTitle>
          <CardDescription>
            Everything {company.name} needs before students rely on it. Have it in files?{" "}
            <Link href={companyImportHref(company.slug)} className="text-primary hover:underline">
              Import for {company.name}
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-lg border" data-testid="company-checklist">
            {readiness.items.map((item) => (
              <li
                key={item.key}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm"
                data-done={item.done}
                data-testid={`check-${item.key}`}
              >
                {item.done ? (
                  <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <Circle className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span className="font-medium">
                  {item.label}
                  <span className="sr-only">{item.done ? " (done)" : " (to do)"}</span>
                </span>
                <span className="min-w-0 flex-1 text-muted-foreground">{item.detail}</span>
                {item.done || item.tab === "overview" ? null : (
                  <Link
                    href={companyTabHref(company.slug, item.tab)}
                    className="text-primary hover:underline"
                  >
                    Fix<span className="sr-only">: {item.label}</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Publish everything</h2>
          </CardTitle>
          <CardDescription>
            Publishes what&apos;s ready, with the same rules as each Publish button. Questions
            shared with other companies go live for them too.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {goLive.length ? (
            <p>
              <span className="font-medium">Goes live:</span> {goLive.join(", ")}.
            </p>
          ) : (
            <p className="text-muted-foreground">Nothing ready to publish.</p>
          )}
          {staysDraft.length ? (
            <div>
              <p className="font-medium">Stays draft:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                {staysDraft.slice(0, 8).map((line, i) => (
                  <li key={i} className="break-words">
                    {line}
                  </li>
                ))}
                {staysDraft.length > 8 ? <li>and {staysDraft.length - 8} more</li> : null}
              </ul>
            </div>
          ) : null}
          {canPublish ? (
            <form action={publishCompanyContentAction}>
              <input type="hidden" name="id" value={company.id} />
              <input type="hidden" name="slug" value={company.slug} />
              <Button
                type="submit"
                className="w-full"
                disabled={!goLive.length && !plan.mocks.length}
                data-testid="publish-everything"
              >
                <Rocket /> Publish everything
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
