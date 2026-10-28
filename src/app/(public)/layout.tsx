import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { PublicHeaderActions, SignedOutActions } from "@/components/layout/public-header-actions";
import { siteConfig } from "@/config/site";
import { env } from "@/server/env";

const allLinks = [
  { href: "/companies", label: "Companies" },
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
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav aria-label="Main" className="hidden items-center gap-6 text-sm md:flex">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
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

      <div className="flex-1">{children}</div>

      <footer className="border-t bg-surface">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-start sm:justify-between sm:px-6">
          <div className="max-w-sm space-y-2">
            <Logo />
            <p className="text-sm text-muted-foreground">{siteConfig.tagline}.</p>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium">Product</p>
            <ul className="space-y-1.5 text-muted-foreground">
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-2 text-sm">
            <p className="font-medium">Company</p>
            <ul className="space-y-1.5 text-muted-foreground">
              {[
                { href: "/become-interviewer", label: "Become an interviewer" },
                { href: "/terms", label: "Terms" },
                { href: "/privacy", label: "Privacy" },
                { href: "/refund-policy", label: "Refunds" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-sm text-muted-foreground">© {siteConfig.name}. Made in India.</p>
        </div>
      </footer>
    </div>
  );
}
