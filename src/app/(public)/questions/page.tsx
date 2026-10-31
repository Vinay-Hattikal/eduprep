import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpenCheck } from "lucide-react";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { siteConfig } from "@/config/site";
import { getPublicSubjects } from "@/server/services/public-questions";

export const metadata: Metadata = {
  title: "Placement practice questions with answers",
  description: `Aptitude, reasoning, verbal and technical questions asked in campus placement tests, organised by topic, with worked answers. Practise free on ${siteConfig.name}.`,
  alternates: { canonical: "/questions" },
};

export default function QuestionsHubPage() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:py-12">
      <header className="space-y-3">
        <h1 className="text-[2.1rem] leading-[1.1] font-bold tracking-[-0.03em] text-balance sm:text-5xl">
          Placement practice questions
        </h1>
        <p className="max-w-2xl text-muted-foreground">
          Questions from campus placement tests, organised by subject and topic. Sample questions
          show worked answers; sign up free to practise them all with a timer and track your
          progress.
        </p>
      </header>
      <Suspense fallback={<PageSkeleton />}>
        <Subjects />
      </Suspense>
    </main>
  );
}

async function Subjects() {
  const subjects = await getPublicSubjects();
  if (!subjects.length)
    return <p className="text-muted-foreground">Questions are being added. Check back soon.</p>;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {subjects.map((subject) => (
        <Card key={subject.id}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpenCheck className="size-5 text-primary" aria-hidden="true" />
              <h2>
                <Link href={`/questions/${subject.slug}`} className="hover:underline">
                  {subject.name}
                </Link>
              </h2>
              <span className="tabular ml-auto text-sm font-normal text-muted-foreground">
                {subject.questions} questions
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {subject.topics.map((topic) => (
                <li key={topic.id}>
                  <Link
                    href={`/questions/${subject.slug}/${topic.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm hover:bg-secondary/50"
                  >
                    {topic.name}
                    <span className="tabular text-xs text-muted-foreground">{topic.questions}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
