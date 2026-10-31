import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";

const POINTS = [
  "Each company's real rounds, sections and timers",
  "Mock tests in the exam's own interface",
  "A readiness score that tells you what to fix next",
];

/** Every sign-in screen: the form on paper, and an ink brand panel on wide screens. */
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
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-inverse p-12 text-inverse-foreground lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_31px,rgb(236_232_225/0.06)_31px,rgb(236_232_225/0.06)_32px)]"
        />
        <p className="relative font-heading text-2xl font-bold tracking-tight">{siteConfig.name}</p>
        <div className="relative max-w-md space-y-8">
          <p className="font-heading text-4xl leading-[1.1] font-bold tracking-[-0.03em] text-balance">
            Walk into your drive knowing{" "}
            <span className="text-highlight">exactly what&apos;s coming.</span>
          </p>
          <ul className="space-y-3 text-inverse-foreground/80">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <CheckCircle2
                  className="mt-0.5 size-5 shrink-0 text-highlight"
                  aria-hidden="true"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-inverse-foreground/60">{siteConfig.tagline}.</p>
      </aside>

      <main className="flex flex-col items-center bg-surface px-4 py-10 sm:py-16 lg:justify-center lg:bg-background">
        <div className="w-full max-w-md space-y-6">
          <div className="flex justify-center lg:justify-start">
            <Logo />
          </div>
          <Card className="lg:border-0 lg:bg-transparent lg:py-0 lg:shadow-none">
            <CardHeader className="lg:px-0">
              <CardTitle>
                <h1 className="text-2xl font-bold tracking-[-0.02em] lg:text-3xl">{title}</h1>
              </CardTitle>
              {description ? <CardDescription>{description}</CardDescription> : null}
            </CardHeader>
            <CardContent className="lg:px-0">{children}</CardContent>
          </Card>
          {footer ? (
            <div className="text-center text-sm text-muted-foreground lg:text-left">{footer}</div>
          ) : null}
          <p className="text-center text-xs text-muted-foreground lg:text-left">
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
    </div>
  );
}
