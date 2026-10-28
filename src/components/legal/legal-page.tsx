import { siteConfig } from "@/config/site";
import { Markdown } from "@/components/shared/markdown";

/** A legal page. The text is a starting draft until reviewed by a lawyer (plan 6.12). */
export function LegalPage({
  title,
  updated,
  body,
}: {
  title: string;
  updated: string;
  body: string;
}) {
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-12 sm:px-6">
      <div className="space-y-1">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {siteConfig.name} · last updated {updated}
        </p>
      </div>
      <p className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
        Draft for review. This text will be finalised with legal advice before launch.
      </p>
      <Markdown className="text-base [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold">
        {body}
      </Markdown>
    </main>
  );
}
