import { Suspense } from "react";
import { AccessGate } from "@/components/layout/access-gate";
import { PageSkeleton } from "@/components/shared/skeletons";

// Exam screens: no app navigation, nothing to distract from the test (like the real thing).
export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-5xl p-6">
          <PageSkeleton />
        </div>
      }
    >
      <AccessGate permission="student.access">{children}</AccessGate>
    </Suspense>
  );
}
