import { Injectable } from '@nestjs/common';
import { monthOf, monthStart } from '../../common/month.js';
import {
  AnalyticsRepository,
  type DailySpend,
  type SpendByModel,
  type SpendByTeam,
  type SpendTotals,
} from './analytics.repository.js';

export interface SpendReport {
  month: string;
  totals: SpendTotals;
  totalBudgetMicroInr: number;
  /** Straight-line month-end estimate from the average daily spend so far. */
  projectedMicroInr: number;
  /** One entry per day from the 1st to today (or month end), zero-filled. */
  daily: DailySpend[];
  byTeam: SpendByTeam[];
  byModel: SpendByModel[];
}

const DAY_MS = 86_400_000;

@Injectable()
export class AnalyticsService {
  constructor(private readonly repo: AnalyticsRepository) {}

  async spend(month = monthOf(new Date())): Promise<SpendReport> {
    const from = monthStart(month);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    const now = new Date();
    const isCurrent = month === monthOf(now);
    const lastDay = isCurrent ? now : new Date(to.getTime() - 1);

    const [totals, daily, byTeam, byModel, totalBudgetMicroInr] = await Promise.all([
      this.repo.totals(from, to),
      this.repo.daily(from, to),
      this.repo.byTeam(from, to),
      this.repo.byModel(from, to),
      this.repo.totalBudget(),
    ]);

    const daysInMonth = Math.round((to.getTime() - from.getTime()) / DAY_MS);
    const daysElapsed = isCurrent ? lastDay.getUTCDate() : daysInMonth;
    const projectedMicroInr = isCurrent
      ? Math.round((totals.costMicroInr / daysElapsed) * daysInMonth)
      : totals.costMicroInr;

    return {
      month,
      totals,
      totalBudgetMicroInr,
      projectedMicroInr,
      daily: fillDays(daily, from, daysElapsed),
      byTeam,
      byModel,
    };
  }
}

function fillDays(rows: DailySpend[], from: Date, days: number): DailySpend[] {
  const byDate = new Map(rows.map((row) => [row.date, row]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    return byDate.get(date) ?? { date, requests: 0, costMicroInr: 0 };
  });
}
