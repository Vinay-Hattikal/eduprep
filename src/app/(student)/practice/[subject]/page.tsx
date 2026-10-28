import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Play } from "lucide-react";
import { MasteryBar } from "@/components/learning/mastery-bar";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePermission } from "@/server/auth";
import { getPracticeCatalog } from "@/server/services/learning";

export const metadata: Metadata = { title: "Practice" };

export default function SubjectPage({ params }: PageProps<"/practice/[subject]">) {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/practice">
          <ArrowLeft /> Practice
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <SubjectTopics params={params} />
      </Suspense>
    </div>
  );
}

async function SubjectTopics({ params }: { params: PageProps<"/practice/[subject]">["params"] }) {
  const user = await requirePermission("student.access");
  const { subject: slug } = await params;
  const subject = (await getPracticeCatalog(user.id)).find((s) => s.slug === slug);
  if (!subject) notFound();
  const topics = subject.topics.filter((t) => t.questions > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={subject.name}
        description={`${subject.questions} questions across ${topics.length} topics. Weakest topics are a good place to start.`}
        actions={
          <Button asChild>
            <Link href={`/practice/session?subject=${subject.slug}`}>
              <Play /> Practise all
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="divide-y p-0">
          {topics.map((topic) => (
            <div
              key={topic.slug}
              className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-6"
            >
              <div className="min-w-0 flex-1 space-y-2">
                <MasteryBar label={topic.name} score={topic.mastery} attempts={topic.attempts} />
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="tabular">{topic.questions} questions</span>
                  {topic.subtopics.map((sub) => (
                    <Link
                      key={sub.slug}
                      href={`/practice/session?topic=${topic.slug}&subtopic=${sub.slug}`}
                      className="rounded-full border px-2 py-0.5 hover:border-primary/40 hover:text-foreground"
                    >
                      {sub.name}
                    </Link>
                  ))}
                </div>
              </div>
              <Button asChild variant="outline" size="sm" className="self-start sm:self-center">
                <Link
                  href={`/practice/session?topic=${topic.slug}`}
                  aria-label={`Practise ${topic.name}`}
                >
                  Practise
                </Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
