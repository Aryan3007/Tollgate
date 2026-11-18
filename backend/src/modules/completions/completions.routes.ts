import { Router } from 'express';
import type { CompletionsController } from './completions.controller.js';
import type { GatewayModelsController } from './gateway-models.controller.js';

/**
 * @openapi
 * /v1/chat/completions:
 *   post:
 *     tags: ["Chat completions"]
 *     summary: Create a chat completion (OpenAI-compatible)
 *     description: >-
 *       Drop-in replacement for OpenAI `POST /v1/chat/completions`: point any OpenAI SDK at this gateway and use a
 *       Tollgate virtual key (`tg_live_…`) as the API key. `model` must be one of the key’s allowed models. With
 *       `stream: true` the response is `text/event-stream`: one `data:` line per `chat.completion.chunk`, terminated
 *       by `data: [DONE]`. Errors before the first chunk are normal HTTP errors; errors after streaming has started
 *       arrive as a final `data: {"error": ...}` event. Unknown OpenAI parameters (tools, response_format, seed, ...)
 *       are passed through to the provider unchanged.
 *     security: [{ virtualKey: [] }]
 *     parameters:
 *       - name: x-tollgate-stats
 *         in: header
 *         required: false
 *         schema: { type: string, example: '1' }
 *         description: >-
 *           Send `1` to get this request’s cost and savings (tokens, ₹, cache result, masked values, latency).
 *           Returned as the `x-tollgate-stats` JSON response header, or for streams as a
 *           `: tollgate-stats {...}` SSE comment after the last chunk.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ChatCompletionRequest' }
 *     responses:
 *       200:
 *         description: >-
 *           Completion. JSON body when stream is false; an SSE stream of chunks when stream is true. The
 *           `x-tollgate-cache` header says whether it came from the cache (hit-exact, hit-semantic, miss or skip).
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ChatCompletion' }
 *           text/event-stream:
 *             schema: { type: string }
 *     x-errors:
 *       400: Invalid request body, or the provider rejected the parameters
 *       401: Missing, unknown, revoked or expired virtual key
 *       403: The key is not allowed to use this model
 *       404: Unknown or disabled model
 *       413: Request body exceeds the size limit
 *       429: >-
 *         Rate limited (`rate_limit_exceeded`, with a Retry-After header), monthly budget used up (`budget_exceeded`),
 *         request larger than a minute’s token allowance (`request_too_large`), or the upstream provider is rate limiting
 *       500: Unexpected gateway error
 *       502: Upstream provider failed, was unreachable, or rejected the gateway credentials
 *       503: The model’s provider is not configured, or budget/rate-limit tracking is unavailable (fails closed)
 *       504: Upstream provider did not respond in time
 * /v1/models:
 *   get:
 *     tags: ["Chat completions"]
 *     summary: List models (OpenAI-compatible)
 *     description: Models the calling virtual key is allowed to use. Bounded by the key’s allow-list (max 50).
 *     security: [{ virtualKey: [] }]
 *     responses:
 *       200:
 *         description: Allowed models
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ModelListing' }
 *     x-errors:
 *       401: Missing, unknown, revoked or expired virtual key
 */
export function completionsRoutes(controller: CompletionsController): Router {
  const router = Router();
  router.post('/', (req, res) => controller.create(req, res));
  return router;
}

export function gatewayModelsRoutes(controller: GatewayModelsController): Router {
  const router = Router();
  router.get('/', (req, res) => controller.list(req, res));
  return router;
}
