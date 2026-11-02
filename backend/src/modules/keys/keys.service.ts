import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
} from '../../common/errors/gateway-error.js';
import type { Paginated } from '../../common/pagination.js';
import { APP_CONFIG } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { monthOf, monthStart } from '../../common/month.js';
import {
  EMPTY_USAGE,
  RequestLogsRepository,
  type UsageTotals,
} from '../request-logs/request-logs.repository.js';
import { ModelCatalogService } from '../providers/model-catalog.service.js';
import { TeamsRepository } from '../teams/teams.repository.js';
import type {
  CreateKeyInput,
  ListKeysQuery,
  UpdateKeyInput,
} from './dto/key.schemas.js';
import { KeyContextService } from './key-context.service.js';
import {
  displayPrefix,
  generateKeySecret,
  hashKeySecret,
} from './key-secret.js';
import { KeysRepository, type KeyView } from './keys.repository.js';

export type KeyWithUsage = KeyView & {
  /** Month-to-date (UTC) totals from the request log. */
  usage: UsageTotals;
};

export interface CreatedKey {
  key: KeyWithUsage;
  /** The only time the full key is ever returned. */
  secret: string;
}

@Injectable()
export class KeysService {
  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly keys: KeysRepository,
    private readonly teams: TeamsRepository,
    private readonly catalog: ModelCatalogService,
    private readonly keyContexts: KeyContextService,
    private readonly logs: RequestLogsRepository,
  ) {}

  async create(input: CreateKeyInput): Promise<CreatedKey> {
    if (!(await this.teams.findById(input.teamId))) {
      throw new UnprocessableError('team_not_found', 'Team does not exist', 'teamId');
    }
    await this.assertModelsExist(input.allowedModels);

    const secret = generateKeySecret();
    const key = await this.keys.insert({
      teamId: input.teamId,
      name: input.name,
      prefix: displayPrefix(secret),
      keyHash: hashKeySecret(this.env.KEY_PEPPER, secret),
      allowedModels: input.allowedModels,
      rpmLimit: input.rpmLimit,
      tpmLimit: input.tpmLimit,
      expiresAt: input.expiresAt,
    });
    return { key: { ...key, usage: EMPTY_USAGE }, secret };
  }

  async list(query: ListKeysQuery): Promise<Paginated<KeyWithUsage>> {
    const page = await this.keys.list(query);
    return { ...page, data: await this.withUsage(page.data) };
  }

  async get(id: string): Promise<KeyWithUsage> {
    const key = await this.keys.findById(id);
    if (!key) throw new NotFoundError('Virtual key');
    const [withUsage] = await this.withUsage([key]);
    return withUsage!;
  }

  async update(id: string, input: UpdateKeyInput): Promise<KeyWithUsage> {
    const existing = await this.get(id);
    if (existing.status === 'revoked') {
      throw new ConflictError('key_revoked', 'A revoked key cannot be changed');
    }
    if (input.allowedModels) await this.assertModelsExist(input.allowedModels);

    await this.keys.update(id, input);
    await this.invalidate(id);
    return this.get(id);
  }

  /** Idempotent: revoking a revoked key returns it unchanged. */
  async revoke(id: string): Promise<KeyWithUsage> {
    await this.get(id);
    if (await this.keys.revoke(id)) await this.invalidate(id);
    return this.get(id);
  }

  private async withUsage(keys: KeyView[]): Promise<KeyWithUsage[]> {
    const usage = await this.logs.usageByKey(
      keys.map((k) => k.id),
      monthStart(monthOf(new Date())),
    );
    return keys.map((key) => ({ ...key, usage: usage.get(key.id) ?? EMPTY_USAGE }));
  }

  private async assertModelsExist(aliases: string[]): Promise<void> {
    const unknown = await this.catalog.unknown(aliases);
    if (unknown.length > 0) {
      throw new UnprocessableError(
        'unknown_models',
        `Unknown or disabled models: ${unknown.join(', ')}`,
        'allowedModels',
      );
    }
  }

  private async invalidate(id: string): Promise<void> {
    const hash = await this.keys.findHash(id);
    if (hash) await this.keyContexts.invalidate(hash);
  }
}
