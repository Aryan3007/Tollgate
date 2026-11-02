import {
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { clientAbortSignal } from '../../common/http/client-abort-signal.js';
import { CurrentKey } from '../../common/http/principal.decorators.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiErrors } from '../../common/swagger/error-responses.js';
import { VirtualKeyGuard } from '../auth/virtual-key.guard.js';
import type { KeyContext } from '../keys/key-context.js';
import { CompletionsService } from './completions.service.js';
import {
  ChatCompletionDto,
  ChatCompletionRequestDto,
} from './dto/chat-completion.dto.js';
import {
  chatCompletionRequestSchema,
  type ChatCompletionRequest,
} from './dto/chat-completion-request.schema.js';
import { type CallStats } from './call-stats.js';
import { pipeSse } from './sse-writer.js';

@ApiTags('Chat completions')
@ApiBearerAuth('virtual-key')
@UseGuards(VirtualKeyGuard)
@Controller('chat/completions')
export class CompletionsController {
  private readonly logger = new Logger(CompletionsController.name);

  constructor(private readonly completions: CompletionsService) {}

  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Create a chat completion (OpenAI-compatible)',
    description:
      'Drop-in replacement for OpenAI `POST /v1/chat/completions`: point any OpenAI SDK at this gateway and use a Tollgate virtual key (`tg_live_…`) as the API key. ' +
      '`model` must be one of the key’s allowed models. ' +
      'With `stream: true` the response is `text/event-stream`: one `data:` line per `chat.completion.chunk`, terminated by `data: [DONE]`. ' +
      'Errors before the first chunk are normal HTTP errors; errors after streaming has started arrive as a final `data: {"error": ...}` event. ' +
      'Unknown OpenAI parameters (tools, response_format, seed, ...) are passed through to the provider unchanged.',
  })
  @ApiHeader({
    name: 'x-tollgate-stats',
    required: false,
    description:
      'Send `1` to get this request’s cost and savings (tokens, ₹, cache result, masked values, latency). ' +
      'Returned as the `x-tollgate-stats` JSON response header, or for streams as a `: tollgate-stats {...}` SSE comment after the last chunk.',
  })
  @ApiBody({ type: ChatCompletionRequestDto })
  @ApiProduces('application/json', 'text/event-stream')
  @ApiResponse({
    status: 200,
    description:
      'Completion. JSON body when stream is false; an SSE stream of chunks when stream is true.',
    type: ChatCompletionDto,
  })
  @ApiErrors({
    400: 'Invalid request body, or the provider rejected the parameters',
    401: 'Missing, unknown, revoked or expired virtual key',
    403: 'The key is not allowed to use this model',
    404: 'Unknown or disabled model',
    413: 'Request body exceeds the size limit',
    429:
      'Rate limited (`rate_limit_exceeded`, with a Retry-After header), monthly budget used up (`budget_exceeded`), ' +
      'request larger than a minute’s token allowance (`request_too_large`), or the upstream provider is rate limiting',
    500: 'Unexpected gateway error',
    502: 'Upstream provider failed, was unreachable, or rejected the gateway credentials',
    503: 'The model’s provider is not configured, or budget/rate-limit tracking is unavailable (fails closed)',
    504: 'Upstream provider did not respond in time',
  })
  async create(
    @Body(new ZodValidationPipe(chatCompletionRequestSchema))
    body: ChatCompletionRequest,
    @CurrentKey() key: KeyContext,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // genReqId (app.module.ts) always assigns a string.
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
