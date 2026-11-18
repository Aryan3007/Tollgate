import type { Request, Response } from 'express';
import { keyOf } from '../../common/http/authenticated-request.js';
import { CompletionsService } from './completions.service.js';

export class GatewayModelsController {
  constructor(private readonly completions: CompletionsService) {}

  async list(req: Request, res: Response): Promise<void> {
    res.json(await this.completions.listModels(keyOf(req)));
  }
}
