"use client";

import {
  Activity,
  Boxes,
  CalendarClock,
  DatabaseZap,
  LineChart,
  PiggyBank,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/data/empty-state";
import { ErrorState } from "@/components/data/error-state";
import { Panel } from "@/components/data/panel";
import { StatCard } from "@/components/data/stat-card";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorOf } from "@/lib/api/client";
import { formatCount, formatInr } from "@/lib/format";
import { useSpendReport } from "../hooks/use-spend";
import { DailySpendChart } from "./daily-spend-chart";
import { RankedBars } from "./ranked-bars";

export function SpendOverview() {
  const report = useSpendReport();

  if (report.isError) {
    return (
      <Panel title="Spend per day" icon={LineChart}>
        <ErrorState
          error={apiErrorOf(report.error)}
          onRetry={() => report.refetch()}
        />
      </Panel>
    );
  }

  const data = report.data;
  const loading = report.isPending;
  const remaining = data
    ? data.totalBudgetMicroInr - data.totals.costMicroInr
    : 0;

  return (
    <>
      <section
        aria-label="This month"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
      >
        <StatCard
          label="Spent this month"
          icon={Wallet}
          loading={loading}
          value={data && formatInr(data.totals.costMicroInr)}
        />
        <StatCard
          label="Projected month-end"
          icon={CalendarClock}
          loading={loading}
          value={data && formatInr(data.projectedMicroInr)}
          hint="At the average daily rate so far"
        />
        <StatCard
          label="Budget remaining"
          icon={PiggyBank}
          loading={loading}
          value={data && formatInr(remaining)}
          hint={
            data && `of ${formatInr(data.totalBudgetMicroInr)} across all teams`
          }
        />
        <StatCard
          label="Saved by cache"
          icon={DatabaseZap}
          loading={loading}
          value={data && formatInr(data.totals.savedMicroInr)}
          hint={
            data &&
            (data.totals.requests === 0
              ? "No requests yet"
              : `${formatCount(data.totals.cacheHits)} of ${formatCount(data.totals.requests)} requests (${Math.round((data.totals.cacheHits / data.totals.requests) * 100)}%) answered from the cache`)
          }
        />
        <StatCard
          label="Requests"
          icon={Activity}
          loading={loading}
          value={data && formatCount(data.totals.requests)}
          hint={data && `${formatCount(data.totals.errors)} failed or refused`}
        />
      </section>

      <Panel title="Spend per day" icon={LineChart}>
        {!data ? (
          <Skeleton className="h-72 w-full" />
        ) : data.totals.requests === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No spend recorded yet"
            description="Costs show up here once apps send requests through Tollgate with a virtual key."
            action={
              <Link
                href="/keys"
                className={buttonVariants({ size: "lg", className: "px-4" })}
              >
                Create a virtual key
              </Link>
            }
          />
        ) : (
          <DailySpendChart daily={data.daily} />
        )}
      </Panel>

      {data && data.totals.requests > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="By team" icon={Users}>
            <RankedBars
              items={data.byTeam.map((team) => ({
                id: team.teamId,
                label: team.teamName,
                costMicroInr: team.costMicroInr,
                requests: team.requests,
              }))}
            />
          </Panel>
          <Panel title="By model" icon={Boxes}>
            <RankedBars
              items={data.byModel.map((model) => ({
                id: model.model,
                label: model.model,
                mono: true,
                costMicroInr: model.costMicroInr,
                requests: model.requests,
              }))}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
