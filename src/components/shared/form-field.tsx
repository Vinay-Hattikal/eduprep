import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = {
  /** Must match the input's id. */
  id: string;
  label: string;
  description?: React.ReactNode;
  error?: string;
  className?: string;
  /** Receives the aria attributes to spread onto the input. */
  children: (aria: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => React.ReactNode;
};

/** Label + input + help text + error, wired up for screen readers. */
export function FormField({ id, label, description, error, className, children }: FormFieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {description ? (
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
