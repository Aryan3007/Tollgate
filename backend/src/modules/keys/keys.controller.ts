import type { Request, Response } from 'express';
import { parse, parseBody } from '../../common/http/parse.js';
import { uuidParam } from '../../common/pagination.js';
import { createKeySchema, listKeysQuery, updateKeySchema } from './dto/key.schemas.js';
import { KeysService } from './keys.service.js';

export class KeysController {
  constructor(private readonly keys: KeysService) {}

  async create(req: Request, res: Response): Promise<void> {
    const body = parseBody(createKeySchema, req.body);
    res.status(201).json(await this.keys.create(body));
  }

  async list(req: Request, res: Response): Promise<void> {
    res.json(await this.keys.list(parse(listKeysQuery, req.query)));
  }

  async get(req: Request, res: Response): Promise<void> {
    res.json(await this.keys.get(parse(uuidParam, req.params.id)));
  }

  async update(req: Request, res: Response): Promise<void> {
    const id = parse(uuidParam, req.params.id);
    const body = parseBody(updateKeySchema, req.body);
    res.json(await this.keys.update(id, body));
  }

  async revoke(req: Request, res: Response): Promise<void> {
    res.json(await this.keys.revoke(parse(uuidParam, req.params.id)));
  }
}
