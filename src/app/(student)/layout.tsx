import { Suspense } from "react";
import { AccessGate } from "@/components/layout/access-gate";
import { AppShell } from "@/components/layout/app-shell";
import { BottomNav, BottomNavPlaceholder } from "@/components/layout/bottom-nav";
import { NavLinks } from "@/components/layout/nav-links";
import { OnboardingGate } from "@/components/layout/onboarding-gate";
import { NavSkeleton, PageSkeleton } from "@/components/shared/skeletons";
import { studentNav } from "@/config/navigation";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      homeHref="/dashboard"
      nav={
        // NavLinks reads the URL, so it streams in on dynamic routes like /practice/[subject].
        <Suspense fallback={<NavSkeleton />}>
          <NavLinks sections={[{ items: studentNav }]} label="Student" />
        </Suspense>
      }
      bottomNav={
        <Suspense fallback={<BottomNavPlaceholder />}>
          <BottomNav items={studentNav.slice(0, 5)} />
        </Suspense>
      }
    >
      <Suspense fallback={<PageSkeleton />}>
        <AccessGate permission="student.access">
          <OnboardingGate>{children}</OnboardingGate>
        </AccessGate>
      </Suspense>
    </AppShell>
  );
}
