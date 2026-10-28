import Link from "next/link";
import { cn } from "@/lib/utils";
import { siteConfig } from "@/config/site";

/** Placeholder mark until the final brand exists (design-system.md section 2). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M9 21.5 14 11l4 7 2.5-4L24 21.5"
        fill="none"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="stroke-primary-foreground"
      />
      <circle cx="24" cy="10" r="2.4" className="fill-highlight" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn("flex items-center gap-2 rounded-md font-semibold tracking-tight", className)}
    >
      <LogoMark />
      <span className="text-lg">{siteConfig.name}</span>
    </Link>
  );
}
