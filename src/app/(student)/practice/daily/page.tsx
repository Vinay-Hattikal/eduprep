import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { PracticePlayer } from "@/components/practice/practice-player";
import { PageHeader } from "@/components/shared/page-header";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { requirePermission } from "@/server/auth";
import {
  dailyAnswer,
  getDailyQuestionId,
  getStudentQuestion,
  practiceUsage,
} from "@/server/services/practice";

export const metadata: Metadata = { title: "Question of the day" };

export default function DailyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link href="/practice">
          <ArrowLeft /> Practice
        </Link>
      </Button>
      <Suspense fallback={<PageSkeleton />}>
        <Daily />
      </Suspense>
    </div>
  );
}

async function Daily() {
  const user = await requirePermission("student.access");
  const questionId = await getDailyQuestionId();
  const [question, answered, usage] = await Promise.all([
    questionId ? getStudentQuestion(user.id, questionId) : null,
    questionId ? dailyAnswer(user.id, questionId) : null,
    practiceUsage(user),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Question of the day"
        description="One question for everyone, every day. It keeps your streak going and doesn't count toward your free limit."
      />
      <PracticePlayer
        initial={question}
        filter={{ source: "all" }}
        mode="DAILY"
        usage={usage}
        single
        alreadyAnswered={Boolean(answered)}
        emptyHref="/practice"
      />
    </div>
  );
}
