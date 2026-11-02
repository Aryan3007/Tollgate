import { InvalidRequestError } from '../../../common/errors/gateway-error.js';
import type { ChatCompletionRequest } from '../../completions/dto/chat-completion-request.schema.js';
import type { ChatCompletion, ChatCompletionChunk, Usage } from '../types.js';
import { UpstreamError } from '../upstream-error.js';

// Pure OpenAI <-> Anthropic Messages API translation, so it can be tested
// against golden fixtures without a network.

type Block = Record<string, unknown>;
type Turn = { role: 'user' | 'assistant'; content: Block[] };

interface AnthropicResponse {
  id: string;
  model: string;
  content: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>;
  stop_reason: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

const DEFAULT_MAX_TOKENS = 1024;

const STOP_REASONS: Record<string, string> = {
  end_turn: 'stop',
  stop_sequence: 'stop',
  max_tokens: 'length',
  tool_use: 'tool_calls',
  refusal: 'content_filter',
};

const finishReason = (reason: string | null | undefined) =>
  reason ? (STOP_REASONS[reason] ?? 'stop') : null;

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n');
}

function imageBlock(part: { image_url?: { url?: string } }): Block {
  const url = part.image_url?.url ?? '';
  const inline = /^data:([^;]+);base64,(.+)$/s.exec(url);
  return inline
    ? { type: 'image', source: { type: 'base64', media_type: inline[1], data: inline[2] } }
    : { type: 'image', source: { type: 'url', url } };
}

function contentBlocks(content: unknown): Block[] {
  if (typeof content === 'string') return content ? [{ type: 'text', text: content }] : [];
  if (!Array.isArray(content)) return [];
  return content.flatMap((part: { type?: string; text?: string; image_url?: { url?: string } }): Block[] => {
    if (part.type === 'text') return [{ type: 'text', text: part.text ?? '' }];
    if (part.type === 'image_url') return [imageBlock(part)];
    throw new InvalidRequestError(`Anthropic models do not support "${part.type}" content`, 'messages');
  });
}

function toolUseBlocks(toolCalls: unknown): Block[] {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((call: { id: string; function: { name: string; arguments: string } }) => ({
    type: 'tool_use',
    id: call.id,
    name: call.function.name,
    input: JSON.parse(call.function.arguments || '{}') as unknown,
  }));
}

/** Anthropic requires alternating roles, so adjacent same-role turns are merged. */
function toTurns(messages: ChatCompletionRequest['messages']): Turn[] {
  const turns: Turn[] = [];
  for (const message of messages) {
    if (message.role === 'system' || message.role === 'developer') continue;

    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const content =
      message.role === 'tool'
        ? [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: textOf(message.content) }]
        : [...contentBlocks(message.content), ...toolUseBlocks(message.tool_calls)];

    const last = turns.at(-1);
    if (last?.role === role) last.content.push(...content);
    else turns.push({ role, content });
  }
  return turns;
}

function systemPrompt(req: ChatCompletionRequest): string | undefined {
  const parts = req.messages
    .filter((m) => m.role === 'system' || m.role === 'developer')
    .map((m) => textOf(m.content));

  // Anthropic has no JSON mode here; instructing the model is the portable way.
  const format = req.response_format as { type?: string; json_schema?: { schema?: unknown } } | undefined;
  if (format?.type === 'json_object') parts.push('Respond with valid JSON only, with no surrounding text.');
  if (format?.type === 'json_schema') {
    parts.push(`Respond with valid JSON only, matching this schema: ${JSON.stringify(format.json_schema?.schema)}`);
  }
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

function toTools(tools: unknown): Block[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  return tools.map((tool: { function: { name: string; description?: string; parameters?: unknown } }) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters ?? { type: 'object', properties: {} },
  }));
}

function toToolChoice(choice: unknown): Block | undefined {
  if (choice === 'auto') return { type: 'auto' };
  if (choice === 'required') return { type: 'any' };
  if (choice === 'none') return { type: 'none' };
  const named = choice as { function?: { name?: string } } | undefined;
  return named?.function?.name ? { type: 'tool', name: named.function.name } : undefined;
}

export function toAnthropicRequest(
  req: ChatCompletionRequest,
  upstreamModel: string,
  stream: boolean,
): Record<string, unknown> {
  if ((req.n ?? 1) > 1) throw new InvalidRequestError('Anthropic models only support n = 1', 'n');

  const stop = req.stop as string | string[] | null | undefined;
  return {
    model: upstreamModel,
    max_tokens: req.max_completion_tokens ?? req.max_tokens ?? DEFAULT_MAX_TOKENS,
    system: systemPrompt(req),
    messages: toTurns(req.messages),
    // OpenAI's scale runs to 2; Anthropic's stops at 1.
    temperature: req.temperature == null ? undefined : Math.min(req.temperature, 1),
    top_p: req.top_p ?? undefined,
    stop_sequences: stop == null ? undefined : [stop].flat(),
    tools: toTools(req.tools),
    tool_choice: toToolChoice(req.tool_choice),
    stream,
  };
}

function toUsage(input: number, output: number): Usage {
  return { prompt_tokens: input, completion_tokens: output, total_tokens: input + output };
}

export function fromAnthropicResponse(body: AnthropicResponse): ChatCompletion {
  const text = body.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const toolCalls = body.content
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({
      id: b.id,
      type: 'function',
      function: { name: b.name, arguments: JSON.stringify(b.input) },
    }));

  return {
    id: `chatcmpl-${body.id}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: body.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: text || null,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finishReason(body.stop_reason),
      },
    ],
    usage: toUsage(body.usage.input_tokens, body.usage.output_tokens),
  };
}

interface StreamEvent {
  type: string;
  message?: { id: string; model: string; usage?: { input_tokens?: number } };
  content_block?: { type: string; id?: string; name?: string };
  delta?: { type?: string; text?: string; partial_json?: string; stop_reason?: string };
  usage?: { output_tokens?: number };
  error?: { type?: string; message?: string };
}

/** Turns Anthropic stream events into OpenAI chunks; holds state between events. */
export class AnthropicStreamTranslator {
  private id = '';
  private model = '';
  private readonly created = Math.floor(Date.now() / 1000);
  private inputTokens = 0;
  private outputTokens = 0;
  private stopReason: string | undefined;
  private toolIndex = -1;

  translate(event: StreamEvent): ChatCompletionChunk[] {
    switch (event.type) {
      case 'message_start':
        this.id = `chatcmpl-${event.message?.id}`;
        this.model = event.message?.model ?? '';
        this.inputTokens = event.message?.usage?.input_tokens ?? 0;
        return [this.chunk({ role: 'assistant', content: '' })];

      case 'content_block_start': {
        if (event.content_block?.type !== 'tool_use') return [];
        this.toolIndex += 1;
        return [
          this.chunk({
            tool_calls: [
              {
                index: this.toolIndex,
                id: event.content_block.id,
                type: 'function',
                function: { name: event.content_block.name, arguments: '' },
              },
            ],
          }),
        ];
      }

      case 'content_block_delta':
        if (event.delta?.type === 'text_delta') return [this.chunk({ content: event.delta.text })];
        if (event.delta?.type === 'input_json_delta') {
          return [
            this.chunk({
              tool_calls: [{ index: this.toolIndex, function: { arguments: event.delta.partial_json } }],
            }),
          ];
        }
        return [];

      case 'message_delta':
        this.stopReason = event.delta?.stop_reason;
        this.outputTokens = event.usage?.output_tokens ?? this.outputTokens;
        return [];

      case 'message_stop':
        return [
          { ...this.chunk({}), choices: [{ index: 0, delta: {}, finish_reason: finishReason(this.stopReason) }] },
          { ...this.chunk({}), choices: [], usage: toUsage(this.inputTokens, this.outputTokens) },
        ];

      case 'error': {
        const overloaded = event.error?.type === 'overloaded_error';
        throw new UpstreamError(
          'anthropic',
          true,
          502,
          overloaded ? 'upstream_overloaded' : 'upstream_error',
          `Upstream anthropic failed: ${event.error?.message ?? 'stream error'}`,
        );
      }

      default:
        return [];
    }
  }

  private chunk(delta: ChatCompletionChunk['choices'][number]['delta']): ChatCompletionChunk {
    return {
      id: this.id,
      object: 'chat.completion.chunk',
      created: this.created,
      model: this.model,
      choices: [{ index: 0, delta, finish_reason: null }],
    };
  }
}
