import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
} from 'drizzle-orm';
import { likePattern, type Paginated } from '../../common/pagination.js';
import { DB, type Database } from '../../db/database.module.js';
import { teams, virtualKeys, type VirtualKey } from '../../db/schema/index.js';
import type { KeyStatus, ListKeysQuery } from './dto/key.schemas.js';
import type { PiiEntity } from '../pii/detectors/index.js';
import type { KeyContext } from './key-context.js';

export interface KeyView {
  id: string;
  teamId: string;
  teamName: string;
  name: string;
  prefix: string;
  allowedModels: string[];
  rpmLimit: number | null;
  tpmLimit: number | null;
  status: KeyStatus;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export type NewKey = Pick<
  VirtualKey,
  'teamId' | 'name' | 'prefix' | 'keyHash' | 'allowedModels'
> &
  Partial<Pick<VirtualKey, 'rpmLimit' | 'tpmLimit' | 'expiresAt'>>;

export type KeyChanges = Partial<
  Pick<VirtualKey, 'name' | 'allowedModels' | 'rpmLimit' | 'tpmLimit' | 'expiresAt'>
>;

const viewColumns = {
  id: virtualKeys.id,
  teamId: virtualKeys.teamId,
  teamName: teams.name,
  name: virtualKeys.name,
  prefix: virtualKeys.prefix,
  allowedModels: virtualKeys.allowedModels,
  rpmLimit: virtualKeys.rpmLimit,
  tpmLimit: virtualKeys.tpmLimit,
  expiresAt: virtualKeys.expiresAt,
  revokedAt: virtualKeys.revokedAt,
  lastUsedAt: virtualKeys.lastUsedAt,
  createdAt: virtualKeys.createdAt,
};

type KeyRow = Omit<KeyView, 'status'>;

function statusOf(row: KeyRow, now = Date.now()): KeyStatus {
  if (row.revokedAt) return 'revoked';
  if (row.expiresAt && row.expiresAt.getTime() <= now) return 'expired';
  return 'active';
}

const toView = (row: KeyRow): KeyView => ({ ...row, status: statusOf(row) });

function statusFilter(status: KeyStatus): SQL | undefined {
  const now = new Date();
  switch (status) {
    case 'revoked':
      return isNotNull(virtualKeys.revokedAt);
    case 'expired':
      return and(
        isNull(virtualKeys.revokedAt),
        lte(virtualKeys.expiresAt, now),
      );
    case 'active':
      return and(
        isNull(virtualKeys.revokedAt),
        or(isNull(virtualKeys.expiresAt), gt(virtualKeys.expiresAt, now)),
      );
  }
}

const sortColumns = {
  createdAt: virtualKeys.createdAt,
  name: virtualKeys.name,
  lastUsedAt: virtualKeys.lastUsedAt,
};

@Injectable()
export class KeysRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async insert(key: NewKey): Promise<KeyView> {
    const [created] = await this.db
      .insert(virtualKeys)
      .values(key)
      .returning({ id: virtualKeys.id });
    return (await this.findById(created!.id))!;
  }

  async findById(id: string): Promise<KeyView | null> {
    const [row] = await this.db
      .select(viewColumns)
      .from(virtualKeys)
      .innerJoin(teams, eq(teams.id, virtualKeys.teamId))
      .where(eq(virtualKeys.id, id));
    return row ? toView(row) : null;
  }

  async findHash(id: string): Promise<string | null> {
    const [row] = await this.db
      .select({ keyHash: virtualKeys.keyHash })
      .from(virtualKeys)
      .where(eq(virtualKeys.id, id));
    return row?.keyHash ?? null;
  }

  async hashesForTeam(teamId: string): Promise<string[]> {
    const rows = await this.db
      .select({ keyHash: virtualKeys.keyHash })
      .from(virtualKeys)
      .where(and(eq(virtualKeys.teamId, teamId), isNull(virtualKeys.revokedAt)));
    return rows.map((r) => r.keyHash);
  }

  async list(query: ListKeysQuery): Promise<Paginated<KeyView>> {
    const where = and(
      query.teamId ? eq(virtualKeys.teamId, query.teamId) : undefined,
      query.status ? statusFilter(query.status) : undefined,
      query.search
        ? or(
            ilike(virtualKeys.name, likePattern(query.search)),
            ilike(virtualKeys.prefix, likePattern(query.search)),
          )
        : undefined,
    );
    const order = query.sortOrder === 'asc' ? asc : desc;

    const [rows, [totals]] = await Promise.all([
      this.db
        .select(viewColumns)
        .from(virtualKeys)
        .innerJoin(teams, eq(teams.id, virtualKeys.teamId))
        .where(where)
        .orderBy(order(sortColumns[query.sortBy]), desc(virtualKeys.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      this.db.select({ total: count() }).from(virtualKeys).where(where),
    ]);

    return {
      data: rows.map(toView),
      page: query.page,
      limit: query.limit,
      total: totals?.total ?? 0,
    };
  }

  async update(id: string, changes: KeyChanges): Promise<void> {
    await this.db.update(virtualKeys).set(changes).where(eq(virtualKeys.id, id));
  }

  /** Returns false when the key was already revoked. */
  async revoke(id: string): Promise<boolean> {
    const updated = await this.db
      .update(virtualKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(virtualKeys.id, id), isNull(virtualKeys.revokedAt)))
      .returning({ id: virtualKeys.id });
    return updated.length > 0;
  }

  async findActiveContextByHash(keyHash: string): Promise<KeyContext | null> {
    const [row] = await this.db
      .select({
        keyId: virtualKeys.id,
        teamId: virtualKeys.teamId,
        allowedModels: virtualKeys.allowedModels,
        keyRpm: virtualKeys.rpmLimit,
        keyTpm: virtualKeys.tpmLimit,
        teamRpm: teams.rpmLimit,
        teamTpm: teams.tpmLimit,
        monthlyBudgetMicroInr: teams.monthlyBudgetMicroInr,
        defaultMaxTokens: teams.defaultMaxTokens,
        piiEntities: teams.piiEntities,
        cacheEnabled: teams.cacheEnabled,
        cacheMaxTemperature: teams.cacheMaxTemperature,
        cacheTtlSeconds: teams.cacheTtlSeconds,
        expiresAt: virtualKeys.expiresAt,
      })
      .from(virtualKeys)
      .innerJoin(teams, eq(teams.id, virtualKeys.teamId))
      .where(
        and(eq(virtualKeys.keyHash, keyHash), isNull(virtualKeys.revokedAt)),
      );
    if (!row) return null;

    return {
      keyId: row.keyId,
      keyHash,
      teamId: row.teamId,
      allowedModels: row.allowedModels,
      rpmLimit: row.keyRpm ?? row.teamRpm,
      tpmLimit: row.keyTpm ?? row.teamTpm,
      teamRpmLimit: row.teamRpm,
      teamTpmLimit: row.teamTpm,
      monthlyBudgetMicroInr: row.monthlyBudgetMicroInr,
      defaultMaxTokens: row.defaultMaxTokens,
      piiEntities: row.piiEntities as PiiEntity[],
      cache: {
        enabled: row.cacheEnabled,
        maxTemperature: row.cacheMaxTemperature,
        ttlSeconds: row.cacheTtlSeconds,
      },
      expiresAt: row.expiresAt?.getTime() ?? null,
    };
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.db
      .update(virtualKeys)
      .set({ lastUsedAt: new Date() })
      .where(eq(virtualKeys.id, id));
  }
}
