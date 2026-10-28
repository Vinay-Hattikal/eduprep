"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navIcons } from "@/components/layout/nav-icons";
import { isActivePath, type NavItem } from "@/config/navigation";
import { cn } from "@/lib/utils";

/** Thumb-reachable tab bar for the student app on phones. */
export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul
        className="grid"
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = navIcons[item.icon];
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[0.6875rem] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden="true" />
                <span className="truncate">{item.title}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Same footprint as the tab bar while it loads, so the page doesn't jump. */
export function BottomNavPlaceholder() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-x-0 bottom-0 z-40 h-[calc(3.5rem+env(safe-area-inset-bottom))] border-t bg-background/95 lg:hidden"
    />
  );
}
