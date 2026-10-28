import "server-only";

import type { OnboardingValues } from "@/schemas/onboarding";
import { db } from "@/server/db";
import { notify } from "@/server/services/notifications";

export async function getOnboardingProfile(userId: string) {
  return db.user.findUniqueOrThrow({
    where: { id: userId },
    select: {
      name: true,
      profileType: true,
      preferredLanguage: true,
      onboardedAt: true,
      fresherProfile: true,
      experiencedProfile: true,
      targetCompanies: {
        orderBy: { createdAt: "asc" },
        select: { companyId: true, targetDate: true },
      },
    },
  });
}

/** Saves the profile and goals. Target companies are replaced; only published ones are kept. */
export async function saveOnboarding(userId: string, values: OnboardingValues): Promise<void> {
  const companyIds = [...new Set(values.targets.map((t) => t.companyId))];
  const published = new Set(
    (
      await db.company.findMany({
        where: { id: { in: companyIds }, status: "PUBLISHED" },
        select: { id: true },
      })
    ).map((c) => c.id),
  );
  const targets = values.targets.filter(
    (t, i, all) =>
      published.has(t.companyId) && all.findIndex((x) => x.companyId === t.companyId) === i,
  );

  const firstTime = await db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        name: values.name,
        profileType: values.profileType,
        preferredLanguage: values.preferredLanguage,
      },
      select: { onboardedAt: true },
    });
    const first = !user.onboardedAt;
    if (first) {
      await tx.user.update({ where: { id: userId }, data: { onboardedAt: new Date() } });
    }

    if (values.profileType === "FRESHER") {
      const profile = {
        college: values.college,
        degree: values.degree,
        branch: values.branch,
        gradYear: values.gradYear,
        cgpaBand: values.cgpaBand,
        hasBacklogs: values.hasBacklogs,
      };
      await tx.fresherProfile.upsert({
        where: { userId },
        create: { userId, ...profile },
        update: profile,
      });
    } else {
      const profile = {
        currentRole: values.currentRole,
        yearsExperience: values.yearsExperience,
        currentCompany: values.currentCompany,
        techStack: values.techStack,
        targetRoles: values.targetRoles,
      };
      await tx.experiencedProfile.upsert({
        where: { userId },
        create: { userId, ...profile },
        update: profile,
      });
    }

    await tx.targetCompany.deleteMany({ where: { userId } });
    if (targets.length) {
      await tx.targetCompany.createMany({
        data: targets.map((t) => ({ userId, companyId: t.companyId, targetDate: t.targetDate })),
      });
    }
    return first;
  });
  // Welcome message once, when onboarding is first completed (PRD 8.14).
  if (firstTime) await notify(userId, "welcome", { name: values.name });
}
