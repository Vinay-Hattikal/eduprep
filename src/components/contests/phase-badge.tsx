import { Badge } from "@/components/ui/badge";
import type { ContestPhase } from "@/lib/contests/ranking";

export function PhaseBadge({ phase }: { phase: ContestPhase }) {
  if (phase === "live")
    return (
      <Badge className="gap-1.5 bg-success/15 text-success hover:bg-success/15">
        <span className="size-1.5 animate-pulse rounded-full bg-success" aria-hidden="true" /> Live
        now
      </Badge>
    );
  if (phase === "upcoming") return <Badge variant="secondary">Upcoming</Badge>;
  if (phase === "closing") return <Badge variant="outline">Results soon</Badge>;
  return <Badge variant="outline">Results out</Badge>;
}
