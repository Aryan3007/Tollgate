import { formatCount, formatInr } from "@/lib/format";

export interface RankedItem {
  id: string;
  label: string;
  mono?: boolean;
  costMicroInr: number;
  requests: number;
}

/** Horizontal magnitude bars, largest first; every row is directly labelled. */
export function RankedBars({ items }: { items: RankedItem[] }) {
  const max = Math.max(...items.map((item) => item.costMicroInr), 1);
  return (
    <ul className="flex flex-col gap-4">
      {items.map((item) => (
        <li key={item.id} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-[15px]">
            <span
              className={item.mono ? "truncate font-mono text-sm" : "truncate"}
            >
              {item.label}
            </span>
            <span className="shrink-0 font-mono text-sm tabular-nums">
              {formatInr(item.costMicroInr)}
              <span className="ml-2 text-muted-foreground">
                {formatCount(item.requests)} req
              </span>
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-muted"
            aria-hidden
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{
                width: `${Math.max(2, (item.costMicroInr / max) * 100)}%`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
