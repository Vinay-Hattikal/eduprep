import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
        <Compass className="size-7" aria-hidden="true" />
      </div>
      <div className="max-w-md space-y-2">
        <p className="tabular text-sm font-medium text-primary">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has moved.
        </p>
      </div>
      <Button asChild>
        <Link href="/">Go home</Link>
      </Button>
    </main>
  );
}
