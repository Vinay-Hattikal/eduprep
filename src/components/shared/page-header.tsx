import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: React.ReactNode;
  /** Buttons or links shown on the right (below the title on phones). */
  actions?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description ? (
          <p className="text-sm text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
