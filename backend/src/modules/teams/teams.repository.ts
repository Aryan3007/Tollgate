import { Inject, Injectable } from '@nestjs/common';
import { asc, count, desc, eq, ilike } from 'drizzle-orm';
import { likePattern, type Paginated } from '../../common/pagination.js';
import { DB, type Database } from '../../db/database.module.js';
import { teams, type Team } from '../../db/schema/index.js';
import type {
  CreateTeamInput,
  ListTeamsQuery,
  UpdateTeamInput,
} from './dto/team.schemas.js';

const sortColumns = { createdAt: teams.createdAt, name: teams.name };

@Injectable()
export class TeamsRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async insert(input: CreateTeamInput): Promise<Team> {
    const [team] = await this.db.insert(teams).values(input).returning();
    return team!;
  }

  async findById(id: string): Promise<Team | null> {
    const [team] = await this.db.select().from(teams).where(eq(teams.id, id));
    return team ?? null;
  }

  async list(query: ListTeamsQuery): Promise<Paginated<Team>> {
    const where = query.search
      ? ilike(teams.name, likePattern(query.search))
      : undefined;
    const order = query.sortOrder === 'asc' ? asc : desc;

    const [data, [totals]] = await Promise.all([
      this.db
        .select()
        .from(teams)
        .where(where)
        .orderBy(order(sortColumns[query.sortBy]), desc(teams.id))
        .limit(query.limit)
        .offset((query.page - 1) * query.limit),
      this.db.select({ total: count() }).from(teams).where(where),
    ]);

    return { data, page: query.page, limit: query.limit, total: totals?.total ?? 0 };
  }

  async update(id: string, input: UpdateTeamInput): Promise<Team | null> {
    const [team] = await this.db
      .update(teams)
      .set(input)
      .where(eq(teams.id, id))
      .returning();
    return team ?? null;
  }
}
