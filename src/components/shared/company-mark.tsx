import { cn } from "@/lib/utils";

/** A company's mark: its initial on an ink tile (until companies have logos). Decorative. */
export function CompanyMark({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-lg bg-inverse font-heading text-lg font-bold text-inverse-foreground",
        className,
      )}
    >
      {name.charAt(0)}
    </span>
  );
}
