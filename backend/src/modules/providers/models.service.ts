import { Injectable } from '@nestjs/common';
import type { Paginated } from '../../common/pagination.js';
import type { ListModelsQuery } from './dto/model.dto.js';
import { ModelCatalogService, type CatalogModel } from './model-catalog.service.js';

export type ModelView = Omit<CatalogModel, 'baseUrl' | 'createdAt' | 'fallbackAliases'>;

@Injectable()
export class ModelsService {
  constructor(private readonly catalog: ModelCatalogService) {}

  async list(query: ListModelsQuery): Promise<Paginated<ModelView>> {
    const all = await this.catalog.list();
    const start = (query.page - 1) * query.limit;
    const data = all
      .slice(start, start + query.limit)
      .map(({ baseUrl: _baseUrl, createdAt: _createdAt, fallbackAliases: _fallbacks, ...view }) => view);
    return { data, page: query.page, limit: query.limit, total: all.length };
  }
}
