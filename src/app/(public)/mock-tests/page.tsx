import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Clock, ListChecks } from "lucide-react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { mockSummary, TEST_KIND_LABELS } from "@/lib/content/public-catalog";
import { listPublicMocks } from "@/server/services/public-catalog";

export const metadata: Metadata = {
  title: "Placement mock tests in the real exam format",
  description:
    "Company mock tests and topic tests with the real sections, timers and negative marking. See each test's pattern free, then take it online.",
  alternates: { canonical: "/mock-tests" },
};

export default function MockTestsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <header className="space-y-3">
        <h1 className="text-[2.1rem] leading-[1.1] font-bold tracking-[-0.03em] text-balance sm:text-5xl">
          Mock tests
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Practise in the real format: the same sections, timers, negative marking and exam screen.
          See each test&apos;s pattern here; sign up free to take it.
        </p>
      </header>
      <Suspense fallback={<PageSkeleton />}>
        <Mocks />
      </Suspense>
    </main>
  );
}

async function Mocks() {
  const mocks = await listPublicMocks();
  if (!mocks.length) return <p className="text-muted-foreground">Mock tests are on the way.</p>;
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {mocks.map((m) => {
        const summary = mockSummary(m.sections);
        return (
          <li key={m.slug}>
            <Card className="h-full">
              <CardHeader>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{TEST_KIND_LABELS[m.kind]}</Badge>
                  {m.company ? <Badge variant="outline">{m.company.name}</Badge> : null}
                </div>
                <CardTitle>
                  <h2>
                    <Link href={`/mock-tests/${m.slug}`} className="hover:underline">
                      {m.title}
                    </Link>
                  </h2>
                </CardTitle>
                {m.description ? <CardDescription>{m.description}</CardDescription> : null}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <ListChecks className="size-4" aria-hidden="true" /> {summary.questions} questions
                  · {summary.sections} section{summary.sections === 1 ? "" : "s"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-4" aria-hidden="true" /> {summary.minutes} min
                </span>
                {summary.negativeMarking ? <span>Negative marking</span> : null}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
