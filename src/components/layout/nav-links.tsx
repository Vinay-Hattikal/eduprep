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
            <p className="px-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
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
                  "flex items-center gap-3 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                  "focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                {item.title}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
