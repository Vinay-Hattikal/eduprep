import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ExamRunner } from "@/components/exam/exam-runner";
import { PageSkeleton } from "@/components/shared/skeletons";
import { requirePermission } from "@/server/auth";
import { getRunnerView } from "@/server/services/tests";

export const metadata: Metadata = { title: "Test in progress", robots: { index: false } };

export default function ExamPage({ params }: PageProps<"/exam/[id]">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl p-6">
          <PageSkeleton />
        </div>
      }
    >
      <Exam params={params} />
    </Suspense>
  );
}

async function Exam({ params }: { params: PageProps<"/exam/[id]">["params"] }) {
  const user = await requirePermission("student.access");
  const { id } = await params;
  const result = await getRunnerView(user, id);
  if (!result) notFound();
  if (result.status === "submitted") redirect(`/tests/results/${id}`);
  // A new section remounts the runner with fresh state from the server.
  return <ExamRunner key={`${result.view.id}:${result.view.current}`} view={result.view} />;
}
