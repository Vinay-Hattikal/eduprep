import Link from "next/link";
import { LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { homePathFor } from "@/lib/permissions";
import { getCurrentUser } from "@/server/auth";

/** Sign in / Get started, shown to everyone while the session loads and to signed-out visitors. */
export function SignedOutActions() {
  return (
    <>
      <Button asChild variant="ghost" className="hidden sm:inline-flex">
        <Link href="/sign-in">Sign in</Link>
      </Button>
      <Button asChild>
        <Link href="/sign-up">Get started</Link>
      </Button>
    </>
  );
}

/** Public pages are open to all; signed-in people get a way back to their own area. */
export async function PublicHeaderActions() {
  const user = await getCurrentUser();
  if (!user) return <SignedOutActions />;
  return (
    <Button asChild>
      <Link href={homePathFor(user.roles)}>
        <LayoutDashboard /> Dashboard
      </Link>
    </Button>
  );
}
