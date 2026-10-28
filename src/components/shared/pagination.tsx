import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type PaginationProps = {
  page: number;
  pageCount: number;
  /** Current query parameters, kept when changing page. */
  params: Record<string, string | undefined>;
  basePath: string;
};

function href(basePath: string, params: PaginationProps["params"], page: number) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value && key !== "page") search.set(key, value);
  if (page > 1) search.set("page", String(page));
  const query = search.toString();
  return query ? `${basePath}?${query}` : basePath;
}

export function Pagination({ page, pageCount, params, basePath }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-2">
      <p className="tabular text-sm text-muted-foreground">
        Page {page} of {pageCount}
      </p>
      <div className="flex gap-2">
        <Button
          asChild
          variant="outline"
          size="sm"
          aria-disabled={page <= 1}
          className={page <= 1 ? "pointer-events-none opacity-50" : ""}
        >
          <Link href={href(basePath, params, page - 1)} tabIndex={page <= 1 ? -1 : undefined}>
            <ChevronLeft /> Previous
          </Link>
        </Button>
        <Button
          asChild
          variant="outline"
          size="sm"
          aria-disabled={page >= pageCount}
          className={page >= pageCount ? "pointer-events-none opacity-50" : ""}
        >
          <Link
            href={href(basePath, params, page + 1)}
            tabIndex={page >= pageCount ? -1 : undefined}
          >
            Next <ChevronRight />
          </Link>
        </Button>
      </div>
    </nav>
  );
}
