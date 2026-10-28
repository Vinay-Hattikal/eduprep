import { CheckboxGroup } from "@/components/shared/checkbox-group";

export type TopicOptions = { name: string; topics: { id: string; name: string }[] }[];

/** Topics grouped by subject, in a scrolling box so long taxonomies stay compact. */
export function TopicPicker({
  id,
  name = "topicIds",
  subjects,
  defaultValues,
  error,
  legend = "Topics",
}: {
  id: string;
  name?: string;
  subjects: TopicOptions;
  defaultValues: readonly string[];
  error?: string;
  legend?: string;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm font-medium" id={`${id}-legend`}>
        {legend}
      </p>
      <div
        className="max-h-64 space-y-4 overflow-y-auto rounded-lg border p-3"
        role="group"
        aria-labelledby={`${id}-legend`}
      >
        {subjects.map((subject, i) => (
          <CheckboxGroup
            key={subject.name}
            id={`${id}-${i}`}
            name={name}
            legend={subject.name}
            options={subject.topics.map((t) => ({ value: t.id, label: t.name }))}
            defaultValues={defaultValues}
          />
        ))}
      </div>
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
