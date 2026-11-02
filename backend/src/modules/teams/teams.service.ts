import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
} from '../../common/errors/gateway-error.js';
import { isUniqueViolation, type Paginated } from '../../common/pagination.js';
import type { Team } from '../../db/schema/index.js';
import { monthOf, monthStart } from '../../common/month.js';
import {
  EMPTY_USAGE,
  RequestLogsRepository,
  type UsageTotals,
} from '../request-logs/request-logs.repository.js';
import { KeyContextService } from '../keys/key-context.service.js';
import { KeysRepository } from '../keys/keys.repository.js';
import type {
  CreateTeamInput,
  ListTeamsQuery,
  UpdateTeamInput,
} from './dto/team.schemas.js';
import { TeamsRepository } from './teams.repository.js';

export type TeamWithSpend = Team & {
  /** Month-to-date (UTC) totals from the request log. */
  usage: UsageTotals;
};

const duplicateName = () =>
  new ConflictError('team_name_taken', 'A team with this name already exists', 'name');

@Injectable()
export class TeamsService {
  constructor(
    private readonly teams: TeamsRepository,
    private readonly keys: KeysRepository,
    private readonly keyContexts: KeyContextService,
    private readonly logs: RequestLogsRepository,
  ) {}

  async create(input: CreateTeamInput): Promise<TeamWithSpend> {
    try {
      return { ...(await this.teams.insert(input)), usage: EMPTY_USAGE };
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateName();
      throw err;
    }
  }

  async list(query: ListTeamsQuery): Promise<Paginated<TeamWithSpend>> {
    const page = await this.teams.list(query);
    return { ...page, data: await this.withUsage(page.data) };
  }

  async get(id: string): Promise<TeamWithSpend> {
    const team = await this.teams.findById(id);
    if (!team) throw new NotFoundError('Team');
    const [withUsage] = await this.withUsage([team]);
    return withUsage!;
  }

  async update(id: string, input: UpdateTeamInput): Promise<TeamWithSpend> {
    let team: Team | null;
    try {
      team = await this.teams.update(id, input);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateName();
      throw err;
    }
    if (!team) throw new NotFoundError('Team');

    // Cached key contexts embed the team's limits; drop them so new limits
    // apply on the next request rather than after the cache TTL.
    const hashes = await this.keys.hashesForTeam(id);
    await Promise.all(hashes.map((hash) => this.keyContexts.invalidate(hash)));
    const [withUsage] = await this.withUsage([team]);
    return withUsage!;
  }

  private async withUsage(teams: Team[]): Promise<TeamWithSpend[]> {
    const usage = await this.logs.usageByTeam(
      teams.map((t) => t.id),
      monthStart(monthOf(new Date())),
    );
    return teams.map((team) => ({ ...team, usage: usage.get(team.id) ?? EMPTY_USAGE }));
  }
}
