import { Inject, Injectable } from '@nestjs/common';
import { and, count, desc, eq, gte, lt, sql, sum } from 'drizzle-orm';
import { DB, type Database } from '../../db/database.module.js';
import { requestLogs, teams } from '../../db/schema/index.js';

export interface SpendTotals {
  requests: number;
  errors: number;
  /** Requests answered from the cache. */
  cacheHits: number;
  /** What those hits would have cost. */
  savedMicroInr: number;
  inputTokens: number;
  outputTokens: number;
  costMicroInr: number;
}

export interface DailySpend {
  date: string;
  requests: number;
  costMicroInr: number;
}

export interface SpendByTeam {
  teamId: string;
  teamName: string;
  requests: number;
  costMicroInr: number;
  budgetMicroInr: number;
}

export interface SpendByModel {
  model: string;
  requests: number;
  costMicroInr: number;
}

/** Breakdowns are capped: dashboards show the top entries, not every row. */
export const TOP_N = 10;

const cost = sql<number>`coalesce(sum(${requestLogs.costMicroInr}), 0)`.mapWith(Number);
// Drizzle has no builder for date_trunc; bucket by UTC day to match budget months.
const utcDay = sql<string>`to_char(date_trunc('day', ${requestLogs.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;

@Injectable()
export class AnalyticsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async totals(from: Date, to: Date): Promise<SpendTotals> {
    const [row] = await this.db
      .select({
        requests: count(),
        errors: sql<number>`count(*) filter (where ${requestLogs.statusCode} >= 400)`.mapWith(Number),
        cacheHits: sql<number>`count(*) filter (where ${requestLogs.cacheStatus} in ('exact', 'semantic'))`.mapWith(Number),
        savedMicroInr: sql<number>`coalesce(sum(${requestLogs.savedMicroInr}), 0)`.mapWith(Number),
        inputTokens: sql<number>`coalesce(sum(${requestLogs.inputTokens}), 0)`.mapWith(Number),
        outputTokens: sql<number>`coalesce(sum(${requestLogs.outputTokens}), 0)`.mapWith(Number),
        costMicroInr: cost,
      })
      .from(requestLogs)
      .where(this.window(from, to));
    return row ?? { requests: 0, errors: 0, cacheHits: 0, savedMicroInr: 0, inputTokens: 0, outputTokens: 0, costMicroInr: 0 };
  }

  daily(from: Date, to: Date): Promise<DailySpend[]> {
    return this.db
      .select({ date: utcDay, requests: count(), costMicroInr: cost })
      .from(requestLogs)
      .where(this.window(from, to))
      .groupBy(utcDay)
      .orderBy(utcDay);
  }

  byTeam(from: Date, to: Date): Promise<SpendByTeam[]> {
    return this.db
      .select({
        teamId: teams.id,
        teamName: teams.name,
        requests: count(),
        costMicroInr: cost,
        budgetMicroInr: teams.monthlyBudgetMicroInr,
      })
      .from(requestLogs)
      .innerJoin(teams, eq(teams.id, requestLogs.teamId))
      .where(this.window(from, to))
      .groupBy(teams.id)
      .orderBy(desc(cost))
      .limit(TOP_N);
  }

  byModel(from: Date, to: Date): Promise<SpendByModel[]> {
    return this.db
      .select({ model: requestLogs.requestedModel, requests: count(), costMicroInr: cost })
      .from(requestLogs)
      .where(this.window(from, to))
      .groupBy(requestLogs.requestedModel)
      .orderBy(desc(cost))
      .limit(TOP_N);
  }

  async totalBudget(): Promise<number> {
    const [row] = await this.db
      .select({ total: sum(teams.monthlyBudgetMicroInr).mapWith(Number) })
      .from(teams);
    return row?.total ?? 0;
  }

  private window(from: Date, to: Date) {
    return and(gte(requestLogs.createdAt, from), lt(requestLogs.createdAt, to));
  }
}
