import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { MobileNav } from "@/components/layout/mobile-nav";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type AppShellProps = {
  /** e.g. "Admin", shown next to the logo. Omit for the student app. */
  areaLabel?: string;
  homeHref: string;
  /** Navigation for the desktop sidebar and the mobile drawer. */
  nav: React.ReactNode;
  /** Optional phone tab bar (student app). */
  bottomNav?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * Layout for signed-in areas: sidebar on desktop, drawer + optional tab bar on phones.
 * Static parts prerender; the user menu streams in (it reads the session).
 */
export function AppShell({ areaLabel, homeHref, nav, bottomNav, children }: AppShellProps) {
  const brand = (
    <div className="flex items-center gap-2">
      <Logo href={homeHref} />
      {areaLabel ? (
        <Badge variant="outline" className="font-semibold tracking-wide uppercase">
          {areaLabel}
        </Badge>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-h-dvh w-full">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center px-5">{brand}</div>
        <div className="flex-1 overflow-y-auto py-4">{nav}</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/70 bg-background/85 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <MobileNav title={areaLabel ? `${areaLabel} menu` : "Menu"}>{nav}</MobileNav>
          <div className="lg:hidden">{brand}</div>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
              <UserMenu />
            </Suspense>
          </div>
        </header>

        <main
          id="main"
          className={cn(
            "mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
            bottomNav ? "pb-24 lg:pb-8" : undefined,
          )}
        >
          {children}
        </main>
      </div>

      {bottomNav}
    </div>
  );
}
