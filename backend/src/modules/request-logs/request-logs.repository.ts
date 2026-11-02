import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, getTableColumns, gte, inArray, lt, sql, sum } from 'drizzle-orm';
import type { Paginated } from '../../common/pagination.js';
import { DB, type Database } from '../../db/database.module.js';
import { requestLogs, teams, virtualKeys, type NewRequestLog, type RequestLog } from '../../db/schema/index.js';
import type { ListRequestsQuery } from './dto/request-log.schemas.js';

export interface UsageTotals {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  costMicroInr: number;
}

export const EMPTY_USAGE: UsageTotals = { requests: 0, inputTokens: 0, outputTokens: 0, costMicroInr: 0 };

export type RequestLogView = RequestLog & {
  keyName: string | null;
  keyPrefix: string | null;
  teamName: string | null;
};

@Injectable()
export class RequestLogsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async insertMany(rows: NewRequestLog[]): Promise<void> {
    if (rows.length > 0) await this.db.insert(requestLogs).values(rows);
  }

  async teamSpendSince(teamId: string, since: Date): Promise<number> {
    const [row] = await this.db
      .select({ total: sum(requestLogs.costMicroInr).mapWith(Number) })
      .from(requestLogs)
      .where(and(eq(requestLogs.teamId, teamId), gte(requestLogs.createdAt, since)));
    return row?.total ?? 0;
  }

  /** One grouped query for a page of keys (no per-key queries). */
  usageByKey(keyIds: string[], since: Date): Promise<Map<string, UsageTotals>> {
    return this.usageBy(requestLogs.keyId, keyIds, since);
  }

  usageByTeam(teamIds: string[], since: Date): Promise<Map<string, UsageTotals>> {
    return this.usageBy(requestLogs.teamId, teamIds, since);
  }

  async list(query: ListRequestsQuery): Promise<Paginated<RequestLogView>> {
    const where = and(
      query.keyId ? eq(requestLogs.keyId, query.keyId) : undefined,
      query.teamId ? eq(requestLogs.teamId, query.teamId) : undefined,
      query.outcome === 'success' ? lt(requestLogs.statusCode, 400) : undefined,
      query.outcome === 'error' ? gte(requestLogs.statusCode, 400) : undefined,
    );
    const order = query.sortOrder === 'asc' ? asc : desc;

    const [data, [totals]] = await Promise.all([
      this.db
        .select({
          ...getTableColumns(requestLogs),
          keyName: virtualKeys.name,
          keyPrefix: virtualKeys.prefix,
          teamName: teams.name,
        })
        .from(requestLogs)
        .leftJoin(virtualKeys, eq(virtualKeys.id, requestLogs.keyId))
        .leftJoin(teams, eq(teams.id, requestLogs.teamId))
        .where(where)
        .orderBy(order(requestLogs.createdAt), desc(requestLogs.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      this.db.select({ total: count() }).from(requestLogs).where(where),
    ]);
    return { data, page: query.page, limit: query.limit, total: totals?.total ?? 0 };
  }

  private async usageBy(
    column: typeof requestLogs.keyId | typeof requestLogs.teamId,
    ids: string[],
    since: Date,
  ): Promise<Map<string, UsageTotals>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({
        id: column,
        requests: count(),
        inputTokens: sql<number>`coalesce(sum(${requestLogs.inputTokens}), 0)`.mapWith(Number),
        outputTokens: sql<number>`coalesce(sum(${requestLogs.outputTokens}), 0)`.mapWith(Number),
        costMicroInr: sql<number>`coalesce(sum(${requestLogs.costMicroInr}), 0)`.mapWith(Number),
      })
      .from(requestLogs)
      .where(and(inArray(column, ids), gte(requestLogs.createdAt, since)))
      .groupBy(column);
    return new Map(rows.map(({ id, ...totals }) => [id, totals]));
  }
}
