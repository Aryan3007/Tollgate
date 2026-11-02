import { StatusBadge, type BadgeTone } from "@/components/data/status-badge";
import { formatCount, formatInr, formatLatency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CallStats } from "../schemas/playground";

function cacheBadge(stats: CallStats): { label: string; tone: BadgeTone } {
  switch (stats.cache) {
    case "hit-exact":
      return { label: "Cache hit", tone: "success" };
    case "hit-semantic":
      return { label: "Semantic hit", tone: "success" };
    case "miss":
      return { label: "Cache miss", tone: "neutral" };
    case "skip":
      return {
        label:
          stats.redactions > 0 ? "Not cached: personal data" : "Not cacheable",
        tone: "warning",
      };
  }
}

function Item({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "font-mono text-sm tabular-nums",
          good && "font-semibold text-success-foreground",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

/** Cost, tokens and savings for one request, as the gateway reported them. */
export function MessageStats({ stats }: { stats: CallStats }) {
  const badge = cacheBadge(stats);
  const hit = stats.cache === "hit-exact" || stats.cache === "hit-semantic";
  const answeredBy = hit
    ? "cache"
    : [stats.provider, stats.model].filter(Boolean).join(" · ");

  return (
    <div className="mt-3 rounded-lg border bg-background p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        {answeredBy && (
          <span className="text-xs text-muted-foreground">
            answered by {answeredBy}
          </span>
        )}
        {stats.failovers > 0 && (
          <span className="text-xs text-muted-foreground">
            failed over ×{stats.failovers}
          </span>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <Item
          label="Tokens used (in / out)"
          value={`${formatCount(stats.inputTokens)} / ${formatCount(stats.outputTokens)}`}
        />
        <Item
          label="Tokens saved"
          value={formatCount(stats.savedTokens)}
          good={stats.savedTokens > 0}
        />
        <Item label="Cost" value={formatInr(stats.costMicroInr)} />
        <Item
          label="Cost saved"
          value={formatInr(stats.savedMicroInr)}
          good={stats.savedMicroInr > 0}
        />
        <Item label="Time" value={formatLatency(stats.latencyMs)} />
        <Item
          label="Values masked"
          value={formatCount(stats.redactions)}
          good={stats.redactions > 0}
        />
      </dl>
    </div>
  );
}
