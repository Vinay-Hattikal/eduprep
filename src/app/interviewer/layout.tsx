import { Suspense } from "react";
import { AccessGate } from "@/components/layout/access-gate";
import { AppShell } from "@/components/layout/app-shell";
import { NavLinks } from "@/components/layout/nav-links";
import { NavSkeleton, PageSkeleton } from "@/components/shared/skeletons";
import { interviewerNav } from "@/config/navigation";

export default function InterviewerLayout({ children }: LayoutProps<"/interviewer">) {
  return (
    <AppShell
      areaLabel="Interviewer"
      homeHref="/interviewer"
      nav={
        <Suspense fallback={<NavSkeleton />}>
          <NavLinks sections={[{ items: interviewerNav }]} label="Interviewer" />
        </Suspense>
      }
    >
      <Suspense fallback={<PageSkeleton />}>
        <AccessGate permission="interviewer.access">{children}</AccessGate>
      </Suspense>
    </AppShell>
  );
}
