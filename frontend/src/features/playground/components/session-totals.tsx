"use client";

import { useMemo } from "react";
import { formatCount, formatInr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePlaygroundStore } from "../store/playground-store";

function Total({
  label,
  value,
  hint,
  good,
}: {
  label: string;
  value: string;
  hint?: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3.5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 font-mono text-xl font-semibold tabular-nums",
          good && "text-success-foreground",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Running totals for everything sent from this page since it was opened or cleared. */
export function SessionTotals() {
  const entries = usePlaygroundStore((s) => s.entries);

  const totals = useMemo(() => {
    const sums = {
      queries: 0,
      hits: 0,
      savedTokens: 0,
      usedTokens: 0,
      saved: 0,
      spent: 0,
    };
    for (const { stats } of entries) {
      if (!stats) continue;
      sums.queries += 1;
      if (stats.cache === "hit-exact" || stats.cache === "hit-semantic")
        sums.hits += 1;
      sums.savedTokens += stats.savedTokens;
      sums.usedTokens += stats.inputTokens + stats.outputTokens;
      sums.saved += stats.savedMicroInr;
      sums.spent += stats.costMicroInr;
    }
    return sums;
  }, [entries]);

  const hitRate =
    totals.queries > 0 ? Math.round((totals.hits / totals.queries) * 100) : 0;
  const withoutCache = totals.spent + totals.saved;

  return (
    <section
      aria-label="This session"
      className="grid grid-cols-2 gap-3 lg:grid-cols-5"
    >
      <Total
        label="Queries"
        value={formatCount(totals.queries)}
        hint={`${formatCount(totals.hits)} from cache (${hitRate}%)`}
      />
      <Total label="Tokens used" value={formatCount(totals.usedTokens)} />
      <Total
        label="Tokens saved"
        value={formatCount(totals.savedTokens)}
        good={totals.savedTokens > 0}
      />
      <Total label="Spent" value={formatInr(totals.spent)} />
      <Total
        label="Saved by cache"
        value={formatInr(totals.saved)}
        good={totals.saved > 0}
        hint={
          withoutCache > 0
            ? `${Math.round((totals.saved / withoutCache) * 100)}% of ${formatInr(withoutCache)}`
            : undefined
        }
      />
    </section>
  );
}
