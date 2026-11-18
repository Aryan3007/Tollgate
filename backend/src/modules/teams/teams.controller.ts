import type { Request, Response } from 'express';
import { parse, parseBody } from '../../common/http/parse.js';
import { uuidParam } from '../../common/pagination.js';
import { createTeamSchema, listTeamsQuery, updateTeamSchema } from './dto/team.schemas.js';
import { TeamsService } from './teams.service.js';

export class TeamsController {
  constructor(private readonly teams: TeamsService) {}

  async create(req: Request, res: Response): Promise<void> {
    const body = parseBody(createTeamSchema, req.body);
    res.status(201).json(await this.teams.create(body));
  }

  async list(req: Request, res: Response): Promise<void> {
    res.json(await this.teams.list(parse(listTeamsQuery, req.query)));
  }

  async get(req: Request, res: Response): Promise<void> {
    res.json(await this.teams.get(parse(uuidParam, req.params.id)));
  }

  async update(req: Request, res: Response): Promise<void> {
    const id = parse(uuidParam, req.params.id);
    const body = parseBody(updateTeamSchema, req.body);
    res.json(await this.teams.update(id, body));
  }
}
