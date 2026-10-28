import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/permissions";
import { requireUser } from "@/server/auth";

/** Sends students who haven't set up their profile to onboarding first (PRD 4.1). */
export async function OnboardingGate({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const studentOnly = !isAdmin(user.roles) && !user.roles.includes("INTERVIEWER");
  if (studentOnly && !user.onboarded) redirect("/onboarding");
  return children;
}
