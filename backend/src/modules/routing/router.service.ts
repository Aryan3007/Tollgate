import { Injectable } from '@nestjs/common';
import type { ChatCompletionRequest } from '../completions/dto/chat-completion-request.schema.js';
import type { KeyContext } from '../keys/key-context.js';
import {
  ModelCatalogService,
  type CatalogModel,
} from '../providers/model-catalog.service.js';

function canServe(model: CatalogModel, req: ChatCompletionRequest): boolean {
  const usesTools = Array.isArray(req.tools) && req.tools.length > 0;
  if (usesTools && !model.supportsTools) return false;
  if (req.response_format != null && !model.supportsJson) return false;
  // Only OpenAI returns several choices from one call.
  if ((req.n ?? 1) > 1 && model.providerKind !== 'openai') return false;
  return true;
}

@Injectable()
export class RouterService {
  constructor(private readonly catalog: ModelCatalogService) {}

  /**
   * The requested model, then its fallback chain. A fallback is used only if
   * the key is allowed to call it and it can serve this request, so failover
   * never widens a key's scope or silently drops a feature.
   */
  async candidates(
    primary: CatalogModel,
    req: ChatCompletionRequest,
    key: KeyContext,
  ): Promise<CatalogModel[]> {
    const fallbacks = await Promise.all(primary.fallbackAliases.map((alias) => this.catalog.get(alias)));
    const usable = fallbacks.filter(
      (model): model is CatalogModel =>
        model !== undefined && key.allowedModels.includes(model.alias) && canServe(model, req),
    );
    return [primary, ...usable];
  }
}
