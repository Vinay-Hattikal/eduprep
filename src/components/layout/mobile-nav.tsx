"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Menu button + slide-in drawer for phones and tablets. Closes when a link is followed. */
export function MobileNav({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 bg-sidebar p-0">
        <SheetHeader className="border-b">
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div
          className="overflow-y-auto py-4"
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
