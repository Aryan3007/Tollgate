import type { Request, Response } from 'express';
import { ProviderHealthService } from './provider-health.service.js';

export class ProviderHealthController {
  constructor(private readonly health: ProviderHealthService) {}

  async list(_req: Request, res: Response): Promise<void> {
    res.json(await this.health.list());
  }
}
