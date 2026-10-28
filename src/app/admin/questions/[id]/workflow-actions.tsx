import { transitionQuestionAction } from "@/app/admin/questions/actions";
import { Button } from "@/components/ui/button";
import { ACTION_LABELS, type ContentAction } from "@/lib/content/workflow";

const VARIANTS: Record<ContentAction, "default" | "outline" | "destructive" | "secondary"> = {
  publish: "default",
  unpublish: "outline",
  archive: "destructive",
  restore: "outline",
};

/** Publish, unpublish, archive and restore buttons for one question. */
export function WorkflowActions({ id, actions }: { id: string; actions: ContentAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <form key={action} action={transitionQuestionAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="action" value={action} />
          <Button type="submit" variant={VARIANTS[action]} data-testid={`question-${action}`}>
            {ACTION_LABELS[action]}
          </Button>
        </form>
      ))}
    </div>
  );
}
