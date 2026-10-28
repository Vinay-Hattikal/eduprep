import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Column<Row> = {
  key: string;
  header: string;
  cell: (row: Row) => React.ReactNode;
  className?: string;
  /** Hide on small screens to keep tables readable on phones. */
  hideOnMobile?: boolean;
};

type DataTableProps<Row> = {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  caption?: string;
};

/** Simple server-rendered table. Sorting, filtering and paging arrive with the question bank (Phase 2). */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  caption,
}: DataTableProps<Row>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <TableHeader>
          <TableRow className="bg-surface hover:bg-surface">
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(column.hideOnMobile && "hidden md:table-cell", column.className)}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((column) => (
                <TableCell
                  key={column.key}
                  className={cn(
                    "align-top whitespace-normal",
                    column.hideOnMobile && "hidden md:table-cell",
                    column.className,
                  )}
                >
                  {column.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
