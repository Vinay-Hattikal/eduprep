import { Suspense } from "react";
import { AccessGate } from "@/components/layout/access-gate";
import { AppShell } from "@/components/layout/app-shell";
import { NavLinks } from "@/components/layout/nav-links";
import { NavSkeleton, PageSkeleton } from "@/components/shared/skeletons";
import { adminNav } from "@/config/navigation";
import { can } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";

/** Shows only the sections this admin's roles allow. */
async function AdminNav() {
  const user = await getCurrentUser();
  const roles = user?.roles ?? [];
  const sections = adminNav
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || can(roles, item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  return <NavLinks sections={sections} label="Admin" />;
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <AppShell
      areaLabel="Admin"
      homeHref="/admin"
      nav={
        <Suspense fallback={<NavSkeleton />}>
          <AdminNav />
        </Suspense>
      }
    >
      <Suspense fallback={<PageSkeleton />}>
        <AccessGate permission="admin.access">{children}</AccessGate>
      </Suspense>
    </AppShell>
  );
}
