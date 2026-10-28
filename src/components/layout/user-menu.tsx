import Link from "next/link";
import { UserMenuDropdown } from "@/components/layout/user-menu-dropdown";
import { Button } from "@/components/ui/button";
import { can, isAdmin, ROLE_LABELS } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";
import { env } from "@/server/env";

/** Reads the session, so it must render inside <Suspense>. */
export async function UserMenu() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <Button asChild size="sm">
        <Link href="/sign-in">Sign in</Link>
      </Button>
    );
  }

  const areas = [
    can(user.roles, "student.access") && { href: "/dashboard", label: "Student app" },
    isAdmin(user.roles) && { href: "/admin", label: "Admin panel" },
    can(user.roles, "interviewer.access") && { href: "/interviewer", label: "Interviewer portal" },
  ].filter((area): area is { href: string; label: string } => Boolean(area));

  return (
    <UserMenuDropdown
      name={user.name}
      email={user.email}
      roleLabels={user.roles.map((role) => ROLE_LABELS[role])}
      areas={areas}
      showPricing={!env().TEST_MODE}
    />
  );
}
