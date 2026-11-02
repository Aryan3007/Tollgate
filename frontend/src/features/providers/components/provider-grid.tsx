"use client";

import { ErrorState } from "@/components/data/error-state";
import { Panel } from "@/components/data/panel";
import { StatusBadge, type BadgeTone } from "@/components/data/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorOf } from "@/lib/api/client";
import { formatCount, formatLatency } from "@/lib/format";
import { useProviderHealth } from "../hooks/use-providers";
import type { ProviderHealth } from "../schemas/provider";

const NAMES: Record<ProviderHealth["kind"], string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  groq: "Groq",
};

const BREAKER: Record<
  ProviderHealth["breaker"],
  { label: string; tone: BadgeTone; help: string }
> = {
  closed: {
    label: "Healthy",
    tone: "success",
    help: "Taking traffic normally.",
  },
  half_open: {
    label: "Recovering",
    tone: "warning",
    help: "Testing the provider with one request.",
  },
  open: {
    label: "Circuit open",
    tone: "danger",
    help: "Traffic is moving to fallback models.",
  },
};

function statusOf(provider: ProviderHealth) {
  if (!provider.enabled)
    return {
      label: "Disabled",
      tone: "neutral" as const,
      help: "Turned off in the catalog.",
    };
  if (!provider.configured)
    return {
      label: "No API key",
      tone: "neutral" as const,
      help: "Add its key to use this provider.",
    };
  return BREAKER[provider.breaker];
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-[15px]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}

function ProviderCard({ provider }: { provider: ProviderHealth }) {
  const status = statusOf(provider);
  const { window } = provider;
  const errorRate =
    window.requests > 0
      ? `${((window.errors / window.requests) * 100).toFixed(1)}%`
      : "—";

  return (
    <section
      aria-label={NAMES[provider.kind]}
      className="rounded-xl border bg-card p-5 sm:p-6"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-medium">{NAMES[provider.kind]}</h2>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{status.help}</p>
      <dl className="mt-4 divide-y border-t">
        <Metric
          label={`Requests (${window.minutes} min)`}
          value={formatCount(window.requests)}
        />
        <Metric label="Error rate" value={errorRate} />
        <Metric
          label="p50 latency"
          value={window.p50Ms === null ? "—" : formatLatency(window.p50Ms)}
        />
        <Metric
          label="p95 latency"
          value={window.p95Ms === null ? "—" : formatLatency(window.p95Ms)}
        />
      </dl>
    </section>
  );
}

export function ProviderGrid() {
  const providers = useProviderHealth();

  if (providers.isError) {
    return (
      <Panel title="Health">
        <ErrorState
          error={apiErrorOf(providers.error)}
          onRetry={() => providers.refetch()}
        />
      </Panel>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
      {providers.isPending
        ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)
        : providers.data.map((provider) => (
            <ProviderCard key={provider.kind} provider={provider} />
          ))}
    </div>
  );
}
