"use client";

import { Snowflake } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { buyFreezeAction } from "@/app/(student)/achievements/actions";
import { Button } from "@/components/ui/button";

export function BuyFreezeButton({ cost, disabled }: { cost: number; disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || pending}
      data-testid="buy-freeze"
      onClick={() =>
        startTransition(async () => {
          const result = await buyFreezeAction();
          if (result.ok) toast.success(`Streak freeze added. You hold ${result.freezes}.`);
          else toast.error(result.error);
        })
      }
    >
      <Snowflake /> Buy a freeze for {cost} points
    </Button>
  );
}
