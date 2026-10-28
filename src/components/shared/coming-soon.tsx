import type { LucideIcon } from "lucide-react";
import { Hammer } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

type ComingSoonProps = {
  title: string;
  description: string;
  /** Build phase from docs/plan.md. */
  phase: number;
  icon?: LucideIcon;
};

/** Placeholder for a navigation destination that a later phase builds. */
export function ComingSoon({ title, description, phase, icon = Hammer }: ComingSoonProps) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <EmptyState
        icon={icon}
        title={`Arrives in Phase ${phase}`}
        description="This section is part of the build plan and isn't available yet."
      />
    </div>
  );
}
