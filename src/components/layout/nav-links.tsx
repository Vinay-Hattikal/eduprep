"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navIcons } from "@/components/layout/nav-icons";
import { isActivePath, type NavSection } from "@/config/navigation";
import { cn } from "@/lib/utils";

/** Sidebar navigation with the active item highlighted. */
export function NavLinks({ sections, label }: { sections: NavSection[]; label: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label} className="space-y-5 px-3">
      {sections.map((section, index) => (
        <div key={section.title ?? index} className="space-y-1">
          {section.title ? (
            <p className="px-2.5 pb-1 text-[0.7rem] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {section.title}
            </p>
          ) : null}
          {section.items.map((item) => {
            const Icon = navIcons[item.icon];
            const active = isActivePath(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "bg-card text-foreground shadow-card ring-1 ring-border before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-primary"
                    : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                  )}
                  aria-hidden="true"
                />
                {item.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
