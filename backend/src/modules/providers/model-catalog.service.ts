import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DB, type Database } from '../../db/database.module.js';
import { models, providers } from '../../db/schema/index.js';
import type { ProviderKind } from './types.js';

export interface CatalogModel {
  alias: string;
  upstreamName: string;
  providerKind: ProviderKind;
  baseUrl: string;
  inputUsdPerMtok: number;
  outputUsdPerMtok: number;
  supportsJson: boolean;
  supportsTools: boolean;
  fallbackAliases: string[];
  createdAt: Date;
}

const CACHE_TTL_MS = 30_000;

/**
 * The model table is small and read on every request, so it is cached in
 * memory per instance. Admin edits show up within the TTL.
 */
@Injectable()
export class ModelCatalogService {
  private cache: { at: number; byAlias: Map<string, CatalogModel> } | null =
    null;

  constructor(@Inject(DB) private readonly db: Database) {}

  async get(alias: string): Promise<CatalogModel | undefined> {
    return (await this.load()).get(alias);
  }

  async list(): Promise<CatalogModel[]> {
    return [...(await this.load()).values()].sort((a, b) =>
      a.alias.localeCompare(b.alias),
    );
  }

  /** Returns the aliases from `aliases` that are not enabled models. */
  async unknown(aliases: string[]): Promise<string[]> {
    const catalog = await this.load();
    return aliases.filter((alias) => !catalog.has(alias));
  }

  invalidate(): void {
    this.cache = null;
  }

  private async load(): Promise<Map<string, CatalogModel>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) {
      return this.cache.byAlias;
    }

    const rows = await this.db
      .select({
        alias: models.alias,
        upstreamName: models.upstreamName,
        providerKind: providers.kind,
        baseUrl: providers.baseUrl,
        inputUsdPerMtok: models.inputUsdPerMtok,
        outputUsdPerMtok: models.outputUsdPerMtok,
        supportsJson: models.supportsJson,
        supportsTools: models.supportsTools,
        fallbackAliases: models.fallbackAliases,
        createdAt: models.createdAt,
      })
      .from(models)
      .innerJoin(providers, eq(providers.id, models.providerId))
      .where(and(eq(models.enabled, true), eq(providers.enabled, true)));

    const byAlias = new Map(rows.map((row) => [row.alias, row]));
    this.cache = { at: Date.now(), byAlias };
    return byAlias;
  }
}
