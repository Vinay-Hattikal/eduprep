import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type StatCardProps = {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  className?: string;
};

export function StatCard({ label, value, hint, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={cn("gap-0 py-4", className)}>
      <CardContent className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{label}</span>
          {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
        </div>
        <div className="tabular text-2xl font-semibold tracking-tight">{value}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
