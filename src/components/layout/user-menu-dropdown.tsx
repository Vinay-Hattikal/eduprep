"use client";

import { CreditCard, LogOut, Sparkles } from "lucide-react";
import Link from "next/link";
import { signOut } from "@/app/(auth)/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type UserMenuDropdownProps = {
  name: string;
  email: string | null;
  roleLabels: string[];
  areas: { href: string; label: string }[];
  showPricing?: boolean;
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function UserMenuDropdown({
  name,
  email,
  roleLabels,
  areas,
  showPricing = true,
}: UserMenuDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Account menu"
          data-testid="user-menu"
        >
          <Avatar className="size-8">
            <AvatarFallback className="bg-secondary text-xs font-semibold text-secondary-foreground">
              {initials(name)}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-1.5 font-normal">
          <p className="truncate font-medium text-foreground">{name}</p>
          {email ? <p className="truncate text-xs text-muted-foreground">{email}</p> : null}
          <div className="flex flex-wrap gap-1">
            {roleLabels.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </div>
        </DropdownMenuLabel>
        {areas.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            {areas.map((area) => (
              <DropdownMenuItem key={area.href} asChild>
                <Link href={area.href}>{area.label}</Link>
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account" data-testid="account-link">
            <CreditCard /> Account and purchases
          </Link>
        </DropdownMenuItem>
        {showPricing ? (
          <DropdownMenuItem asChild>
            <Link href="/pricing">
              <Sparkles /> Plans and pricing
            </Link>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <button type="submit" className="w-full" data-testid="sign-out">
              <LogOut /> Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
