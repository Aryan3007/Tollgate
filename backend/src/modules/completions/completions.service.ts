import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AllProvidersFailedError,
  ForbiddenError,
  GatewayError,
  NotFoundError,
  ProviderNotConfiguredError,
  ServiceUnavailableError,
} from '../../common/errors/gateway-error.js';
import { APP_CONFIG } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { BudgetService, type Reservation } from '../budget/budget.service.js';
import {
  actualCostMicroInr,
  estimatedCostMicroInr,
  estimateInputTokens,
  maxOutputTokens,
  type TokenCounts,
} from '../budget/pricing.js';
import type { KeyContext } from '../keys/key-context.js';
import {
  ModelCatalogService,
  type CatalogModel,
} from '../providers/model-catalog.service.js';
import { BreakerRegistry } from '../providers/circuit-breaker/breaker-registry.js';
import { ProviderRegistry } from '../providers/provider-registry.js';
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ProviderAdapter,
  UpstreamContext,
  Usage,
} from '../providers/types.js';
import { UpstreamError } from '../providers/upstream-error.js';
import type { RedactionMap } from '../pii/redaction-map.js';
import { redactRequest, restoreCompletion } from '../pii/redactor.js';
import { ChunkRestorer } from '../pii/stream/chunk-restorer.js';
import { SemanticCacheService, type CachedResponse } from '../semantic-cache/semantic-cache.service.js';
import { RateLimitService } from '../rate-limit/rate-limit.service.js';
import { RequestLogWriter } from '../request-logs/request-log.writer.js';
import { RouterService } from '../routing/router.service.js';
import type { ChatCompletionRequest } from './dto/chat-completion-request.schema.js';
import { type CacheHeader, type CallStats } from './call-stats.js';
import { PhaseTimer } from './phase-timer.js';

export interface ModelListing {
  object: 'list';
  data: Array<{ id: string; object: 'model'; created: number; owned_by: string }>;
}

interface AttemptContext extends UpstreamContext {
  body: ChatCompletionRequest;
}

export interface GatewayCall {
  body: ChatCompletionRequest;
  key: KeyContext;
  requestId: string;
  signal: AbortSignal;
  /** Called once a request's cost and savings are known. */
  onStats?: (stats: CallStats) => void;
}

/** Status logged when the client disconnects mid-stream (nginx convention). */
const CLIENT_CLOSED = 499;

interface Prepared {
  /** Requested model first, then usable fallbacks. */
  candidates: CatalogModel[];
  /** The request as providers see it: PII already masked. */
  body: ChatCompletionRequest;
  /** Placeholders to put back into the response. */
  pii: RedactionMap;
  estimate: TokenCounts;
  /** Set once the budget has been reserved (a cache hit never reserves). */
  reservation?: Reservation;
  /** Whether this request may use the cache at all. */
  cacheable: boolean;
  /** The candidate tried last, and how many failed before it. */
  model?: CatalogModel;
  failovers: number;
}

/** What is known about a request when it is logged. */
interface Outcome {
  statusCode: number;
  errorCode?: string;
  model?: CatalogModel;
  servedModel?: string;
  tokens?: TokenCounts;
  costMicroInr?: number;
  ttfbMs?: number;
  failovers?: number;
  redactions?: number;
  cacheStatus?: 'miss' | 'exact' | 'semantic' | 'skipped';
  savedMicroInr?: number;
  /** Milliseconds spent in each pipeline phase (logged, not stored). */
  phases?: Record<string, number>;
}

/**
 * The gateway pipeline, in order: model access → rate limit → budget reserve
 * → provider call with failover → settle → log. Every exit path settles or releases the
 * reservation and writes exactly one log row.
 */
@Injectable()
export class CompletionsService {
  private readonly logger = new Logger(CompletionsService.name);

  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly catalog: ModelCatalogService,
    private readonly providers: ProviderRegistry,
    private readonly router: RouterService,
    private readonly breakers: BreakerRegistry,
    private readonly rateLimits: RateLimitService,
    private readonly budget: BudgetService,
    private readonly logs: RequestLogWriter,
    private readonly cache: SemanticCacheService,
  ) {}

  async complete(call: GatewayCall): Promise<{ completion: ChatCompletion; cache: CacheHeader }> {
    const startedAt = performance.now();
    const timer = new PhaseTimer();
    let prepared: Prepared | undefined;
    try {
      prepared = await this.prepare(call);
      timer.lap('prepare');

      const hit = prepared.cacheable ? await this.cache.lookup(prepared.body, call.key) : null;
      timer.lap('cache');
      if (hit) {
        this.recordHit(call, startedAt, hit.kind, hit.entry, timer);
        return { completion: completionFromCache(hit.entry), cache: `hit-${hit.kind}` };
      }

      await this.reserve(prepared, call);
      timer.lap('reserve');
      const { value: completion, model } = await this.withFailover(prepared, call.signal, (adapter, ctx) =>
        adapter.complete(ctx.body, ctx),
      );
      timer.lap('upstream');

      const tokens = tokensFrom(completion.usage) ?? prepared.estimate;
      const cost = this.cost(tokens, model);
      await this.budget.settle(prepared.reservation!, cost);
      this.record(call, startedAt, {
        statusCode: 200,
        model,
        servedModel: completion.model,
        tokens,
        costMicroInr: cost,
        failovers: prepared.failovers,
        redactions: prepared.pii.count,
        cacheStatus: prepared.cacheable ? 'miss' : 'skipped',
        phases: timer.ms,
      });
      this.reportStats(call, startedAt, {
        cache: prepared.cacheable ? 'miss' : 'skip',
        provider: model.providerKind,
        model: completion.model,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        savedTokens: 0,
        costMicroInr: cost,
        savedMicroInr: 0,
        redactions: prepared.pii.count,
        failovers: prepared.failovers,
      });

      const choice = completion.choices[0];
      if (prepared.cacheable && completion.choices.length === 1 && choice?.finish_reason === 'stop' && typeof choice.message.content === 'string') {
        this.storeInCache(prepared, call, {
          model: completion.model,
          content: choice.message.content,
          usage: completion.usage ?? { prompt_tokens: tokens.inputTokens, completion_tokens: tokens.outputTokens, total_tokens: tokens.inputTokens + tokens.outputTokens },
          costMicroInr: cost,
        });
      }
      return { completion: restoreCompletion(completion, prepared.pii), cache: prepared.cacheable ? 'miss' : 'skip' };
    } catch (err) {
      await this.releaseIfReserved(prepared);
      timer.lap('failed');
      this.record(call, startedAt, { ...this.failureOutcome(err, prepared), phases: timer.ms });
      throw err;
    }
  }

  /**
   * Resolves only once the first upstream chunk has arrived. Failures before
   * that point reject, so the caller can still send a normal HTTP error (and,
   * later, fail over to another provider).
   */
  async openStream(call: GatewayCall): Promise<{ chunks: AsyncGenerator<ChatCompletionChunk>; cache: CacheHeader }> {
    const startedAt = performance.now();
    const timer = new PhaseTimer();
    let prepared: Prepared | undefined;
    try {
      prepared = await this.prepare(call);
      timer.lap('prepare');

      const hit = prepared.cacheable ? await this.cache.lookup(prepared.body, call.key) : null;
      timer.lap('cache');
      if (hit) {
        this.recordHit(call, startedAt, hit.kind, hit.entry, timer);
        return {
          chunks: replayAsStream(hit.entry, call.body.stream_options?.include_usage === true),
          cache: `hit-${hit.kind}`,
        };
      }

      await this.reserve(prepared, call);
      timer.lap('reserve');
      const { value, model } = await this.withFailover(prepared, call.signal, async (adapter, ctx) => {
        const upstream = adapter.stream(ctx.body, ctx)[Symbol.asyncIterator]();
        try {
          return { upstream, first: await upstream.next() };
        } catch (err) {
          await upstream.return?.().catch(() => undefined);
          throw err;
        }
      });
      timer.lap('upstream_first_byte');
      return {
        chunks: this.relay(call, prepared, model, value.upstream, value.first, startedAt),
        cache: prepared.cacheable ? 'miss' : 'skip',
      };
    } catch (err) {
      await this.releaseIfReserved(prepared);
      timer.lap('failed');
      this.record(call, startedAt, { ...this.failureOutcome(err, prepared), phases: timer.ms });
      throw err;
    }
  }

  /** OpenAI-format list of the models this key may call. */
  async listModels(key: KeyContext): Promise<ModelListing> {
    const allowed = new Set(key.allowedModels);
    const models = await this.catalog.list();
    return {
      object: 'list',
      data: models
        .filter((model) => allowed.has(model.alias))
        .map((model) => ({
          id: model.alias,
          object: 'model',
          created: Math.floor(model.createdAt.getTime() / 1000),
          owned_by: model.providerKind,
        })),
    };
  }

  private async prepare({ body, key }: GatewayCall): Promise<Prepared> {
    const model = await this.catalog.get(body.model);
    if (!model) throw new NotFoundError(`Model "${body.model}"`, 'model_not_found');
    if (!key.allowedModels.includes(body.model)) {
      throw new ForbiddenError('model_not_allowed', `This API key is not allowed to use "${body.model}"`);
    }
    // Mask PII before anything else sees the prompt (estimates, providers).
    const { request: masked, map: pii } = redactRequest(body, key.piiEntities);
    // Cap output upstream so the real cost can never exceed the reservation
    // because of an unbounded completion.
    const capped: ChatCompletionRequest =
      masked.max_tokens == null && masked.max_completion_tokens == null
        ? { ...masked, max_completion_tokens: key.defaultMaxTokens }
        : masked;
    const estimate: TokenCounts = {
      inputTokens: estimateInputTokens(capped),
      outputTokens: maxOutputTokens(capped, key.defaultMaxTokens),
    };

    const candidates = await this.router.candidates(model, capped, key);

    await this.rateLimits.consume(key, estimate.inputTokens + estimate.outputTokens);

    return {
      candidates,
      body: capped,
      pii,
      estimate,
      cacheable: this.cache.ineligibleReason(capped, key, pii.count) === null,
      failovers: 0,
    };
  }

  /** Reserves budget for the priciest candidate: failover must not outrun the budget. */
  private async reserve(prepared: Prepared, { key, requestId }: GatewayCall): Promise<void> {
    const worstCase = Math.max(
      ...prepared.candidates.map((c) => estimatedCostMicroInr(prepared.estimate, c, this.env.USD_INR_RATE)),
    );
    prepared.reservation = await this.budget.reserve(key.teamId, key.monthlyBudgetMicroInr, worstCase, requestId);
  }

  private async releaseIfReserved(prepared: Prepared | undefined): Promise<void> {
    if (prepared?.reservation) await this.budget.release(prepared.reservation);
  }

  private failureOutcome(err: unknown, prepared: Prepared | undefined): Outcome {
    return {
      ...failure(err),
      model: prepared?.model,
      failovers: prepared?.failovers,
      redactions: prepared?.pii.count,
      cacheStatus: prepared?.cacheable ? 'miss' : 'skipped',
    };
  }

  /** Fire and forget: a slow or failed cache write must never delay or fail the response. */
  private storeInCache(prepared: Prepared, call: GatewayCall, entry: CachedResponse): void {
    void this.cache.store(prepared.body, call.key, entry);
  }

  /**
   * Tries candidates in order. Only runs until a provider answers: `run` must
   * resolve at the first byte, because after that the client has part of an
   * answer and switching provider would splice two different responses.
   */
  private async withFailover<T>(
    prepared: Prepared,
    signal: AbortSignal,
    run: (adapter: ProviderAdapter, ctx: AttemptContext) => Promise<T>,
  ): Promise<{ value: T; model: CatalogModel }> {
    const attempted: string[] = [];
    let lastError: unknown;

    for (const model of prepared.candidates) {
      const breaker = this.breakers.for(model.providerKind);
      if (!breaker.tryAcquire()) continue;
      prepared.model = model;

      try {
        const value = await run(this.providers.get(model.providerKind), {
          body: prepared.body,
          signal,
          baseUrl: model.baseUrl,
          upstreamModel: model.upstreamName,
        });
        breaker.onSuccess();
        return { value, model };
      } catch (err) {
        if (signal.aborted) {
          breaker.onCancelled();
          throw err;
        }
        if (err instanceof ProviderNotConfiguredError) {
          breaker.onCancelled();
          lastError = err;
          continue;
        }
        if (!(err instanceof UpstreamError)) {
          breaker.onCancelled();
          throw err;
        }
        if (!err.retryable) {
          // The provider answered; the request itself was wrong.
          breaker.onSuccess();
          throw err;
        }
        breaker.onFailure();
        lastError = err;
        attempted.push(model.providerKind);
        prepared.failovers = attempted.length;
      }
    }

    if (attempted.length > 1) throw new AllProvidersFailedError(attempted);
    if (lastError) throw lastError;
    throw new ServiceUnavailableError(
      'provider_unavailable',
      'The provider for this model is temporarily unavailable and no fallback could take the request',
    );
  }

  private async *relay(
    call: GatewayCall,
    prepared: Prepared,
    model: CatalogModel,
    upstream: AsyncIterator<ChatCompletionChunk>,
    first: IteratorResult<ChatCompletionChunk>,
    startedAt: number,
  ): AsyncGenerator<ChatCompletionChunk> {
    const clientWantsUsage = call.body.stream_options?.include_usage === true;
    const ttfbMs = Math.round(performance.now() - startedAt);
    let usage: Usage | undefined;
    let servedModel: string | undefined;
    let outputChars = 0;
    let text = '';
    let finishReason: string | null = null;
    let outcome: Outcome = { statusCode: CLIENT_CLOSED, errorCode: 'client_closed' };
    let next = first;
    const restorer = new ChunkRestorer(prepared.pii);

    try {
      while (!next.done) {
        const chunk = restorer.transform(next.value);
        servedModel ??= chunk.model;
        if (chunk.usage) usage = chunk.usage;
        for (const choice of chunk.choices) {
          outputChars += choice.delta.content?.length ?? 0;
          if (choice.index === 0) {
            text += choice.delta.content ?? '';
            finishReason = choice.finish_reason ?? finishReason;
          }
        }

        if (clientWantsUsage) {
          yield chunk;
        } else if (chunk.choices.length > 0) {
          // The gateway always asks upstream for usage; hide it from clients
          // that did not, so they get exactly what OpenAI would have sent.
          const { usage: _usage, ...rest } = chunk;
          yield rest as ChatCompletionChunk;
        }
        next = await upstream.next();
      }
      outcome = { statusCode: 200 };
    } catch (err) {
      if (!call.signal.aborted) {
        outcome = failure(err);
        this.breakers.for(model.providerKind).onFailure();
      }
      throw err;
    } finally {
      await upstream.return?.();
      // Without a usage chunk (abort, mid-stream failure) charge what was
      // visibly produced: the estimated prompt plus streamed characters.
      const tokens = tokensFrom(usage) ?? {
        inputTokens: prepared.estimate.inputTokens,
        outputTokens: Math.ceil(outputChars / 4),
      };
      const cost = this.cost(tokens, model);
      await this.budget.settle(prepared.reservation!, cost);
      this.record(call, startedAt, {
        ...outcome,
        cacheStatus: prepared.cacheable ? 'miss' : 'skipped',
        model,
        servedModel,
        tokens,
        costMicroInr: cost,
        ttfbMs,
        failovers: prepared.failovers,
        redactions: prepared.pii.count,
      });
      this.reportStats(call, startedAt, {
        cache: prepared.cacheable ? 'miss' : 'skip',
        provider: model.providerKind,
        model: servedModel ?? model.alias,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        savedTokens: 0,
        costMicroInr: cost,
        savedMicroInr: 0,
        redactions: prepared.pii.count,
        failovers: prepared.failovers,
      });
      if (prepared.cacheable && outcome.statusCode === 200 && finishReason === 'stop' && text && usage) {
        this.storeInCache(prepared, call, { model: servedModel ?? model.alias, content: text, usage, costMicroInr: cost });
      }
    }
  }

  private cost(tokens: TokenCounts, model: CatalogModel): number {
    return actualCostMicroInr(tokens, model, this.env.USD_INR_RATE);
  }

  private recordHit(call: GatewayCall, startedAt: number, kind: 'exact' | 'semantic', entry: CachedResponse, timer: PhaseTimer): void {
    this.record(call, startedAt, {
      statusCode: 200,
      servedModel: entry.model,
      cacheStatus: kind,
      savedMicroInr: entry.costMicroInr,
      phases: timer.ms,
    });
    this.reportStats(call, startedAt, {
      cache: `hit-${kind}`,
      provider: null,
      model: entry.model,
      inputTokens: 0,
      outputTokens: 0,
      savedTokens: entry.usage.total_tokens,
      costMicroInr: 0,
      savedMicroInr: entry.costMicroInr,
      redactions: 0,
      failovers: 0,
    });
  }

  private reportStats(call: GatewayCall, startedAt: number, stats: Omit<CallStats, 'latencyMs'>): void {
    call.onStats?.({ ...stats, latencyMs: Math.round(performance.now() - startedAt) });
  }

  private record(call: GatewayCall, startedAt: number, outcome: Outcome): void {
    const latencyMs = Math.round(performance.now() - startedAt);
    this.logs.write({
      requestId: call.requestId,
      teamId: call.key.teamId,
      keyId: call.key.keyId,
      requestedModel: call.body.model,
      provider: outcome.model?.providerKind,
      servedModel: outcome.servedModel,
      streamed: call.body.stream === true,
      statusCode: outcome.statusCode,
      errorCode: outcome.errorCode,
      inputTokens: outcome.tokens?.inputTokens ?? 0,
      outputTokens: outcome.tokens?.outputTokens ?? 0,
      costMicroInr: outcome.costMicroInr ?? 0,
      latencyMs,
      ttfbMs: outcome.ttfbMs,
      failoverCount: outcome.failovers ?? 0,
      redactionCount: outcome.redactions ?? 0,
      cacheStatus: outcome.cacheStatus ?? 'skipped',
      savedMicroInr: outcome.savedMicroInr ?? 0,
    });
    this.logger.log(
      {
        requestId: call.requestId,
        model: call.body.model,
        keyId: call.key.keyId,
        status: outcome.statusCode,
        costMicroInr: outcome.costMicroInr ?? 0,
        latencyMs,
        phases: outcome.phases,
      },
      'completion finished',
    );
  }
}

function tokensFrom(usage: Usage | null | undefined): TokenCounts | undefined {
  return usage
    ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
    : undefined;
}

function failure(err: unknown): Outcome {
  return err instanceof GatewayError
    ? { statusCode: err.status, errorCode: err.code }
    : { statusCode: 500, errorCode: 'internal_error' };
}

/** Rebuilds a response from a cached answer; the id and timestamp are fresh. */
function completionFromCache(entry: CachedResponse): ChatCompletion {
  return {
    id: `chatcmpl-cache-${randomUUID()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: entry.model,
    choices: [{ index: 0, message: { role: 'assistant', content: entry.content }, finish_reason: 'stop' }],
    usage: entry.usage,
  };
}

const REPLAY_PIECE_CHARS = 24;

/** Replays a cached answer in the same chunk shapes a live stream uses. */
async function* replayAsStream(entry: CachedResponse, includeUsage: boolean): AsyncGenerator<ChatCompletionChunk> {
  const base = {
    id: `chatcmpl-cache-${randomUUID()}`,
    object: 'chat.completion.chunk' as const,
    created: Math.floor(Date.now() / 1000),
    model: entry.model,
  };
  const chunk = (delta: ChatCompletionChunk['choices'][number]['delta'], finish: string | null = null): ChatCompletionChunk => ({
    ...base,
    choices: [{ index: 0, delta, finish_reason: finish }],
  });

  yield chunk({ role: 'assistant', content: '' });
  for (let i = 0; i < entry.content.length; i += REPLAY_PIECE_CHARS) {
    yield chunk({ content: entry.content.slice(i, i + REPLAY_PIECE_CHARS) });
  }
  yield chunk({}, 'stop');
  if (includeUsage) yield { ...base, choices: [], usage: entry.usage };
}
