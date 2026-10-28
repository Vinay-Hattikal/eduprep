"use client";

import { Link2Off } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { revokeShareAction } from "@/app/(student)/achievements/actions";
import { Button } from "@/components/ui/button";

export function RevokeShareButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await revokeShareAction(id);
          toast.success("Link turned off");
        })
      }
    >
      <Link2Off /> Turn off
    </Button>
  );
}
