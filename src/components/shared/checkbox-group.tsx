import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type CheckboxGroupProps = {
  /** Prefix for the checkbox ids; also the group's id for error wiring. */
  id: string;
  /** Form field name; every checked option submits its value under it. */
  name: string;
  legend: string;
  options: { value: string; label: string }[];
  defaultValues: readonly string[];
  description?: React.ReactNode;
  error?: string;
  className?: string;
  emptyText?: string;
};

/** A labelled set of checkboxes that submits like a multi-select. */
export function CheckboxGroup({
  id,
  name,
  legend,
  options,
  defaultValues,
  description,
  error,
  className,
  emptyText = "Nothing to choose from yet.",
}: CheckboxGroupProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <fieldset
      className={cn("min-w-0 space-y-2", className)}
      aria-describedby={[descriptionId, errorId].filter(Boolean).join(" ") || undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="text-sm leading-none font-medium">{legend}</legend>
      {options.length ? (
        <div className="grid gap-x-4 gap-y-2 pt-1 sm:grid-cols-2 lg:grid-cols-3">
          {options.map((option) => (
            <div key={option.value} className="flex min-w-0 items-center gap-2">
              <Checkbox
                id={`${id}-${option.value}`}
                name={name}
                value={option.value}
                defaultChecked={defaultValues.includes(option.value)}
              />
              <Label htmlFor={`${id}-${option.value}`} className="truncate font-normal">
                {option.label}
              </Label>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      )}
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
    </fieldset>
  );
}
