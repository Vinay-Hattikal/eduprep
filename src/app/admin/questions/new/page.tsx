import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { EMPTY_QUESTION, taxonomyOptions } from "@/app/admin/questions/editor-data";
import { QuestionEditor } from "@/app/admin/questions/question-editor";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/auth";

export const metadata: Metadata = { title: "New question" };

export default function NewQuestionPage() {
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/admin/questions">
          <ArrowLeft /> Questions
        </Link>
      </Button>
      <PageHeader
        title="New question"
        description="Saved as a draft. Submit it for review when it's ready."
      />
      <Suspense fallback={<PageSkeleton />}>
        <NewQuestion />
      </Suspense>
    </div>
  );
}

async function NewQuestion() {
  await requirePermission("content.edit");
  return <QuestionEditor taxonomy={await taxonomyOptions()} initial={EMPTY_QUESTION} />;
}
