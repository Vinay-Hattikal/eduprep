import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { PublicHeaderActions, SignedOutActions } from "@/components/layout/public-header-actions";
import { siteConfig } from "@/config/site";
import { env } from "@/server/env";

const allLinks = [
  { href: "/companies", label: "Companies" },
  { href: "/questions", label: "Questions" },
  { href: "/problems", label: "Coding" },
  { href: "/mock-tests", label: "Mock tests" },
  { href: "/jobs", label: "Jobs" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#features", label: "Features" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#who-its-for", label: "Who it's for" },
];

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  // TEST_MODE: payments are off, so pricing is hidden.
  const links = env().TEST_MODE ? allLinks.filter((l) => l.href !== "/pricing") : allLinks;
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/95">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-1 text-sm lg:flex">
            {/* Content pages only; the landing page's section links stay in the footer. */}
            {links
              .filter((link) => !link.href.startsWith("/#"))
              .map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-md px-2.5 py-1.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
          </nav>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <Suspense fallback={<SignedOutActions />}>
              <PublicHeaderActions />
            </Suspense>
          </div>
        </div>
      </header>

      {/* At least a screen tall, so the footer starts below the fold and doesn't jump as
          streamed content arrives (CLS budget, D-062). */}
      <div className="min-h-[calc(100dvh-4rem)] flex-1">{children}</div>

      <footer className="bg-inverse text-inverse-foreground">
        <div className="mx-auto w-full max-w-6xl px-4 pt-14 pb-8 sm:px-6">
          <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
            <div className="max-w-sm space-y-3">
              <p className="font-heading text-2xl font-bold tracking-tight">{siteConfig.name}</p>
              <p className="text-sm text-inverse-foreground/70">{siteConfig.tagline}.</p>
            </div>
            {[
              { title: "Prepare", links: links.filter((l) => !l.href.startsWith("/#")) },
              { title: "On this site", links: links.filter((l) => l.href.startsWith("/#")) },
              {
                title: "Company",
                links: [
                  { href: "/become-interviewer", label: "Become an interviewer" },
                  { href: "/terms", label: "Terms" },
                  { href: "/privacy", label: "Privacy" },
                  { href: "/refund-policy", label: "Refunds" },
                ],
              },
            ].map((group) => (
              <div key={group.title} className="space-y-3 text-sm">
                <p className="text-xs font-semibold tracking-[0.08em] text-inverse-foreground/60 uppercase">
                  {group.title}
                </p>
                <ul className="space-y-2">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-inverse-foreground/85 underline-offset-4 hover:text-inverse-foreground hover:underline"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-inverse-foreground/15 pt-6 text-xs text-inverse-foreground/60">
            <p>© {siteConfig.name}. Made in India.</p>
            <p>{siteConfig.url.replace(/^https?:\/\//, "")}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
