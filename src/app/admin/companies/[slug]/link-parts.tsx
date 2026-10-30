import { Link2, Link2Off, Search } from "lucide-react";
import { linkItemAction, unlinkItemAction } from "@/app/admin/companies/content-actions";
import { ContentStatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { ContentStatus } from "@/generated/prisma/enums";
import type { LinkKind } from "@/server/services/company-links";

// The parts every company content tab shares (D-057, D-067): unlink a row, and search the bank
// for an item to link.

type Company = { id: string; slug: string };

export function UnlinkButton({
  company,
  kind,
  linkId,
  label,
}: {
  company: Company;
  kind: LinkKind;
  linkId: string;
  label: string;
}) {
  return (
    <form action={unlinkItemAction}>
      <input type="hidden" name="slug" value={company.slug} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="linkId" value={linkId} />
      <Button
        type="submit"
        variant="ghost"
        size="icon"
        aria-label={`Unlink ${label}`}
        title="Unlink from this company"
      >
        <Link2Off />
      </Button>
    </form>
  );
}

export function LinkExistingCard({
  company,
  kind,
  tab,
  title,
  description,
  placeholder,
  q,
  results,
}: {
  company: Company;
  kind: LinkKind;
  /** The tab the search stays on. */
  tab: string;
  title: string;
  description: string;
  placeholder: string;
  q: string;
  results: readonly { id: string; externalId: string; status: ContentStatus; label: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2>{title}</h2>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="flex flex-wrap gap-2" role="search" aria-label={placeholder}>
          <input type="hidden" name="tab" value={tab} />
          <div className="relative min-w-48 flex-1">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              name="q"
              defaultValue={q}
              placeholder={placeholder}
              aria-label={placeholder}
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
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
                  <span className="font-mono text-xs">{r.externalId}</span>
                  <span className="min-w-0 flex-1 basis-48 truncate">{r.label}</span>
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
  );
}
