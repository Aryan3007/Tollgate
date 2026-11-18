import type { Request, Response } from 'express';
import { parse } from '../../common/http/parse.js';
import { listRequestsQuery } from './dto/request-log.schemas.js';
import { RequestLogsRepository } from './request-logs.repository.js';

export class RequestLogsController {
  constructor(private readonly logs: RequestLogsRepository) {}

  async list(req: Request, res: Response): Promise<void> {
    res.json(await this.logs.list(parse(listRequestsQuery, req.query)));
  }
}
