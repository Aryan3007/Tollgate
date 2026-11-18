import type { Request, Response } from 'express';
import { clientAbortSignal } from '../../common/http/client-abort-signal.js';
import { keyOf } from '../../common/http/authenticated-request.js';
import { parseBody } from '../../common/http/parse.js';
import { createLogger } from '../../common/logger.js';
import { type CallStats } from './call-stats.js';
import { CompletionsService } from './completions.service.js';
import { chatCompletionRequestSchema } from './dto/chat-completion-request.schema.js';
import { pipeSse } from './sse-writer.js';

export class CompletionsController {
  private readonly logger = createLogger(CompletionsController.name);

  constructor(private readonly completions: CompletionsService) {}

  async create(req: Request, res: Response): Promise<void> {
    const body = parseBody(chatCompletionRequestSchema, req.body);
    const key = keyOf(req);
    // pino-http (app.ts) always assigns a string request id.
    const requestId = typeof req.id === 'string' ? req.id : JSON.stringify(req.id);
    // Cost and savings are only sent to callers that ask for them.
    const wantsStats = ['1', 'true'].includes(String(req.headers['x-tollgate-stats']));
    let stats: CallStats | undefined;
    const call = {
      body,
      key,
      requestId,
      signal: clientAbortSignal(res),
      onStats: wantsStats ? (s: CallStats) => void (stats = s) : undefined,
    };

    if (body.stream) {
      const { chunks, cache } = await this.completions.openStream(call);
      res.setHeader('x-tollgate-cache', cache);
      // The stream's cost is only known once it ends, so it follows the last chunk.
      await pipeSse(res, chunks, call.signal, this.logger, () => stats && `tollgate-stats ${JSON.stringify(stats)}`);
      return;
    }

    const { completion, cache } = await this.completions.complete(call);
    res.setHeader('x-tollgate-cache', cache);
    if (stats) res.setHeader('x-tollgate-stats', JSON.stringify(stats));
    res.json(completion);
  }
}
