import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowRight, FlaskConical } from "lucide-react";
import { signInAsDevUser } from "@/app/(auth)/actions";
import { Logo } from "@/components/brand/logo";
import { TableSkeleton } from "@/components/shared/skeletons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Role } from "@/generated/prisma/enums";
import { isAdmin, ROLE_LABELS, safeRedirectPath } from "@/lib/permissions";
import { db } from "@/server/db";
import { env } from "@/server/env";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

type DevUser = { id: string; name: string; email: string | null; roles: Role[] };

export default function DevLoginPage({ searchParams }: PageProps<"/dev-login">) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-surface px-4 py-10 sm:py-16">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl">Sign in</h1>
            </CardTitle>
            <CardDescription>Choose a test account to continue.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <FlaskConical />
              <AlertTitle>Development sign-in</AlertTitle>
              <AlertDescription>
                Fictional seeded accounts for development and tests (AUTH_MODE=dev). Real accounts
                use email or phone sign-in.
              </AlertDescription>
            </Alert>
            <Suspense fallback={<TableSkeleton rows={6} />}>
              <DevUsers searchParams={searchParams} />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

async function DevUsers({
  searchParams,
}: {
  searchParams: PageProps<"/dev-login">["searchParams"];
}) {
  if (env().AUTH_MODE !== "dev") notFound();

  const params = await searchParams;
  const next = safeRedirectPath(typeof params.next === "string" ? params.next : null);

  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, roles: true },
  });

  if (users.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No accounts yet. Run <code className="font-mono">npm run db:seed</code> and reload.
      </p>
    );
  }

  const groups: { title: string; users: DevUser[] }[] = [
    {
      title: "Students",
      users: users.filter((u) => !isAdmin(u.roles) && u.roles.includes("STUDENT")),
    },
    {
      title: "Interviewers",
      users: users.filter((u) => !isAdmin(u.roles) && u.roles.includes("INTERVIEWER")),
    },
    { title: "Admins", users: users.filter((u) => isAdmin(u.roles)) },
  ];

  return (
    <div className="space-y-6">
      {groups
        .filter((group) => group.users.length > 0)
        .map((group) => (
          <section key={group.title} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">{group.title}</h2>
            <ul className="space-y-2">
              {group.users.map((user) => (
                <li key={user.id}>
                  <form action={signInAsDevUser}>
                    <input type="hidden" name="userId" value={user.id} />
                    {next ? <input type="hidden" name="next" value={next} /> : null}
                    <button
                      type="submit"
                      data-testid={`dev-login-${user.email}`}
                      className="group flex w-full items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{user.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      </div>
                      <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                        {user.roles.map((role) => (
                          <Badge key={role} variant="secondary">
                            {ROLE_LABELS[role]}
                          </Badge>
                        ))}
                      </div>
                      <ArrowRight
                        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}
