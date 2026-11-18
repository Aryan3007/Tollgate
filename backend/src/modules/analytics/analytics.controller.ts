import type { Request, Response } from 'express';
import { parse } from '../../common/http/parse.js';
import { AnalyticsService } from './analytics.service.js';
import { spendQuery } from './dto/spend.schemas.js';

export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  async spend(req: Request, res: Response): Promise<void> {
    const query = parse(spendQuery, req.query);
    res.json(await this.analytics.spend(query.month));
  }
}
