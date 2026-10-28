import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** The centred card every sign-in screen shares. */
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-surface px-4 py-10 sm:py-16">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl">{title}</h1>
            </CardTitle>
            {description ? <CardDescription>{description}</CardDescription> : null}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer ? <div className="text-center text-sm text-muted-foreground">{footer}</div> : null}
        <p className="text-center text-xs text-muted-foreground">
          By continuing you agree to the{" "}
          <Link href="/terms" className="underline">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
