import Link from "next/link";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";

/**
 * The brand mark (D-068): an "A" on a peacock-teal tile, its crossbar in saffron. Colours come
 * from the theme tokens, so it follows light and dark mode. The favicon (app/icon.svg) matches.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path
        d="M9.5 23.5 16 8.5l6.5 15"
        fill="none"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
      <path
        d="M12.4 18h7.2"
        fill="none"
        strokeWidth="3.2"
        strokeLinecap="round"
        className="stroke-highlight"
      />
    </svg>
  );
}

/** The mark and the wordmark, set in the display face. */
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2 rounded-md font-heading tracking-tight", className)}
    >
      <LogoMark />
      <span className="text-[1.2rem] leading-none font-bold">{siteConfig.name}</span>
    </Link>
  );
}
