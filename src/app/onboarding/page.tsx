import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingForm } from "@/app/onboarding/onboarding-form";
import { Logo } from "@/components/brand/logo";
import { UserMenu } from "@/components/layout/user-menu";
import { PageSkeleton } from "@/components/shared/skeletons";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { istDay } from "@/lib/learning/dates";
import { requirePermission } from "@/server/auth";
import { getOnboardingProfile } from "@/server/services/onboarding";
import { getPublishedCompanies } from "@/server/services/public-companies";

export const metadata: Metadata = { title: "Set up your preparation", robots: { index: false } };

export default function OnboardingPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-surface px-4 py-8 sm:py-12">
      <div className="w-full max-w-2xl space-y-6">
        <div className="flex items-center justify-between gap-3">
          <Logo />
          {/* Lets someone who signed in with the wrong account switch before onboarding. */}
          <Suspense fallback={<div className="size-8" />}>
            <UserMenu />
          </Suspense>
        </div>
        <Suspense fallback={<PageSkeleton />}>
          <Onboarding />
        </Suspense>
      </div>
    </main>
  );
}

async function Onboarding() {
  const user = await requirePermission("student.access");
  const [profile, companies] = await Promise.all([
    getOnboardingProfile(user.id),
    getPublishedCompanies(),
  ]);
  const year = istDay().getUTCFullYear();
  const fresher = profile.fresherProfile;
  const experienced = profile.experiencedProfile;
  const isEdit = profile.onboardedAt !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl">
            {isEdit ? "Your profile and goals" : "Let's set up your preparation"}
          </h1>
        </CardTitle>
        <CardDescription>
          {isEdit
            ? "Changes update your plan and readiness straight away."
            : "Three quick steps. You can change these any time."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OnboardingForm
          isEdit={isEdit}
          companies={companies.map((c) => ({ id: c.id, name: c.name }))}
          gradYears={Array.from({ length: 7 }, (_, i) => year - 2 + i)}
          initial={{
            name: profile.name,
            profileType: profile.profileType ?? "FRESHER",
            preferredLanguage: profile.preferredLanguage ?? "",
            college: fresher?.college ?? "",
            degree: fresher?.degree ?? "",
            branch: fresher?.branch ?? "",
            gradYear: fresher?.gradYear ? String(fresher.gradYear) : "",
            cgpaBand: fresher?.cgpaBand ?? "",
            hasBacklogs: fresher?.hasBacklogs ?? false,
            currentRole: experienced?.currentRole ?? "",
            yearsExperience: experienced?.yearsExperience?.toString() ?? "",
            currentCompany: experienced?.currentCompany ?? "",
            techStack: experienced?.techStack.join(", ") ?? "",
            targetRoles: experienced?.targetRoles.join(", ") ?? "",
            targets: profile.targetCompanies.map((t) => ({
              companyId: t.companyId,
              targetDate: t.targetDate?.toISOString().slice(0, 10) ?? "",
            })),
          }}
        />
      </CardContent>
    </Card>
  );
}
