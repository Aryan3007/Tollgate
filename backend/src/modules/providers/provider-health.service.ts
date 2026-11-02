import { Inject, Injectable } from '@nestjs/common';
import { count, gte, isNotNull, sql, and } from 'drizzle-orm';
import { DB, type Database } from '../../db/database.module.js';
import { providers, requestLogs } from '../../db/schema/index.js';
import { SecretStore } from '../../infra/keyvault/secret-store.js';
import { BreakerRegistry } from './circuit-breaker/breaker-registry.js';
import type { BreakerState } from './circuit-breaker/circuit-breaker.js';
import type { ProviderKind } from './types.js';

export interface ProviderHealth {
  kind: ProviderKind;
  enabled: boolean;
  /** A key for this provider is available from the secret store. */
  configured: boolean;
  breaker: BreakerState;
  window: { minutes: number; requests: number; errors: number; p50Ms: number | null; p95Ms: number | null };
}

const WINDOW_MINUTES = 15;

@Injectable()
export class ProviderHealthService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly secrets: SecretStore,
    private readonly breakers: BreakerRegistry,
  ) {}

  async list(): Promise<ProviderHealth[]> {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
    const [rows, stats] = await Promise.all([
      this.db.select().from(providers).orderBy(providers.kind),
      this.db
        .select({
          provider: requestLogs.provider,
          requests: count(),
          errors: sql<number>`count(*) filter (where ${requestLogs.statusCode} >= 500)`.mapWith(Number),
          // Drizzle has no builder for ordered-set aggregates.
          p50Ms: sql<number | null>`percentile_cont(0.5) within group (order by ${requestLogs.latencyMs})`.mapWith(Number),
          p95Ms: sql<number | null>`percentile_cont(0.95) within group (order by ${requestLogs.latencyMs})`.mapWith(Number),
        })
        .from(requestLogs)
        .where(and(gte(requestLogs.createdAt, since), isNotNull(requestLogs.provider)))
        .groupBy(requestLogs.provider),
    ]);
    const byProvider = new Map(stats.map((row) => [row.provider, row]));

    return Promise.all(
      rows.map(async ({ kind, enabled }) => {
        const stat = byProvider.get(kind);
        return {
          kind,
          enabled,
          configured: await this.isConfigured(kind),
          breaker: await this.breakers.stateOf(kind),
          window: {
            minutes: WINDOW_MINUTES,
            requests: stat?.requests ?? 0,
            errors: stat?.errors ?? 0,
            p50Ms: stat?.p50Ms == null ? null : Math.round(stat.p50Ms),
            p95Ms: stat?.p95Ms == null ? null : Math.round(stat.p95Ms),
          },
        };
      }),
    );
  }

  private async isConfigured(kind: ProviderKind): Promise<boolean> {
    return this.secrets.getProviderKey(kind).then(
      () => true,
      () => false,
    );
  }
}
