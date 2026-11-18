import type { Request, Response } from 'express';
import { parse } from '../../common/http/parse.js';
import { listModelsQuery } from './dto/model.schemas.js';
import { ModelsService } from './models.service.js';

export class ModelsController {
  constructor(private readonly models: ModelsService) {}

  async list(req: Request, res: Response): Promise<void> {
    res.json(await this.models.list(parse(listModelsQuery, req.query)));
  }
}
