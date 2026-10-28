"use client";

import { Copy, Download, Link2Off, Share2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createShareAction, revokeShareAction } from "@/app/(student)/achievements/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { siteConfig } from "@/config/site";
import { linkedinShareUrl, whatsappShareUrl } from "@/lib/engagement/share";

type Props = {
  kind: "TEST_RESULT" | "CONTEST" | "BADGE";
  refId: string;
  /** Pre-filled message for WhatsApp. */
  text: string;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
};

/**
 * Makes a public share card on first click (opt-in), then offers WhatsApp, LinkedIn, copy and
 * the image. The student can turn the link off again.
 */
export function ShareButton({
  kind,
  refId,
  text,
  label = "Share",
  variant = "outline",
  size = "sm",
}: Props) {
  const [id, setId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const url = id ? `${siteConfig.url}/s/${id}` : "";

  function share() {
    startTransition(async () => {
      const result = await createShareAction({ kind, refId });
      if (!result.ok) return void toast.error(result.error);
      setId(result.id);
      const link = `${siteConfig.url}/s/${result.id}`;
      // Phones: the system share sheet covers WhatsApp, LinkedIn and everything else.
      if (
        typeof navigator !== "undefined" &&
        "share" in navigator &&
        window.matchMedia("(pointer: coarse)").matches
      ) {
        try {
          await navigator.share({ title: siteConfig.name, text, url: link });
          return;
        } catch {
          // Cancelled or unsupported: fall back to the dialog.
        }
      }
      setOpen(true);
    });
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={share}
        disabled={pending}
        data-testid="share-button"
      >
        <Share2 /> {pending ? "Preparing…" : label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share your achievement</DialogTitle>
            <DialogDescription>
              Anyone with the link sees your first name and this result, nothing else.
            </DialogDescription>
          </DialogHeader>
          {id ? (
            <div className="space-y-4">
              {/* eslint-disable-next-line @next/next/no-img-element -- generated image, not optimisable */}
              <img
                src={`/s/${id}/image`}
                alt="Your share card"
                width={1200}
                height={630}
                className="aspect-[1200/630] w-full rounded-lg border"
              />
              <div className="flex gap-2">
                <Input readOnly value={url} aria-label="Share link" data-testid="share-url" />
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(url);
                    toast.success("Link copied");
                  }}
                >
                  <Copy /> Copy
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <Button asChild>
                  <a href={whatsappShareUrl(text, url)} target="_blank" rel="noopener noreferrer">
                    WhatsApp
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={linkedinShareUrl(url)} target="_blank" rel="noopener noreferrer">
                    LinkedIn
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <a href={`/s/${id}/image`} download="achievement.png">
                    <Download /> Image
                  </a>
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() =>
                  startTransition(async () => {
                    await revokeShareAction(id);
                    setId(null);
                    setOpen(false);
                    toast.success("Link turned off. Nobody can open it now.");
                  })
                }
              >
                <Link2Off /> Turn off this link
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
