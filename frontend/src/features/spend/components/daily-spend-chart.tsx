"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCount, formatInr } from "@/lib/format";
import type { SpendReport } from "../schemas/spend";

// SVG presentation attributes don't resolve CSS variables reliably, so the
// chart takes literal values that mirror the theme tokens in globals.css.
const CHART = {
  bar: "#2f7d45", // --primary (validated: lightness, chroma, 3:1 vs surface)
  grid: "#e5e7eb", // --border
  axis: "#6b7280", // --muted-foreground
  cursor: "#f3f4f6", // --muted
};

type Day = SpendReport["daily"][number];

const dayLabel = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const formatDay = (date: string) =>
  dayLabel.format(new Date(`${date}T00:00:00Z`));

function formatAxisInr(micro: number): string {
  const rupees = micro / 1_000_000;
  return `₹${rupees.toLocaleString("en-IN", { maximumSignificantDigits: 3 })}`;
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Day }>;
}) {
  const day = payload?.[0]?.payload;
  if (!active || !day) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-sm shadow-md">
      <p className="text-muted-foreground">{formatDay(day.date)}</p>
      <p className="mt-1 font-mono font-semibold tabular-nums">
        {formatInr(day.costMicroInr)}
      </p>
      <p className="text-muted-foreground">
        {formatCount(day.requests)} requests
      </p>
    </div>
  );
}

/** One series (spend per UTC day), so no legend: the panel title names it. */
export function DailySpendChart({ daily }: { daily: SpendReport["daily"] }) {
  return (
    <figure>
      <div className="h-72 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={daily}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
            barCategoryGap={2}
          >
            <CartesianGrid
              vertical={false}
              stroke={CHART.grid}
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="date"
              tickFormatter={formatDay}
              tick={{ fill: CHART.axis, fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: CHART.grid }}
              minTickGap={24}
            />
            <YAxis
              tickFormatter={formatAxisInr}
              tick={{ fill: CHART.axis, fontSize: 12 }}
              tickLine={false}
              axisLine={false}
              width={72}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: CHART.cursor }}
              isAnimationActive={false}
            />
            <Bar
              dataKey="costMicroInr"
              fill={CHART.bar}
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">Spend per day this month</figcaption>
      <table className="sr-only">
        <thead>
          <tr>
            <th>Date</th>
            <th>Spend</th>
            <th>Requests</th>
          </tr>
        </thead>
        <tbody>
          {daily.map((day) => (
            <tr key={day.date}>
              <td>{formatDay(day.date)}</td>
              <td>{formatInr(day.costMicroInr)}</td>
              <td>{day.requests}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
