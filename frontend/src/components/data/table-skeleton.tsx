import { Skeleton } from "@/components/ui/skeleton";
import { TableBody, TableCell, TableRow } from "@/components/ui/table";

export function TableSkeleton({
  columns,
  rows = 5,
}: {
  columns: number;
  rows?: number;
}) {
  return (
    <TableBody aria-busy="true">
      {Array.from({ length: rows }, (_, row) => (
        <TableRow key={row}>
          {Array.from({ length: columns }, (_, col) => (
            <TableCell key={col} className="px-4 py-4 sm:px-6">
              <Skeleton className="h-5 w-full max-w-36" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </TableBody>
  );
}
