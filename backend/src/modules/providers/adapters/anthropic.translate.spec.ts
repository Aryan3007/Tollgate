import { InvalidRequestError } from '../../../common/errors/gateway-error.js';
import type { ChatCompletionRequest } from '../../completions/dto/chat-completion-request.schema.js';
import { UpstreamError } from '../upstream-error.js';
import {
  AnthropicStreamTranslator,
  fromAnthropicResponse,
  toAnthropicRequest,
} from './anthropic.translate.js';

const request = (overrides: Record<string, unknown>) =>
  ({ model: 'claude-haiku-4-5', messages: [{ role: 'user', content: 'Hi' }], ...overrides }) as ChatCompletionRequest;

describe('toAnthropicRequest', () => {
  it('moves system messages to the top level and requires max_tokens', () => {
    const body = toAnthropicRequest(
      request({
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'developer', content: 'Use rupees.' },
          { role: 'user', content: 'Hi' },
        ],
        max_tokens: 50,
      }),
      'claude-haiku-4-5-20251001',
      false,
    );

    expect(body).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      system: 'Be brief.\n\nUse rupees.',
      max_tokens: 50,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hi' }] }],
    });
  });

  it('merges adjacent turns so roles alternate', () => {
    const body = toAnthropicRequest(
      request({
        messages: [
          { role: 'user', content: 'One' },
          { role: 'user', content: 'Two' },
        ],
      }),
      'm',
      false,
    );

    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'One' }, { type: 'text', text: 'Two' }] },
    ]);
  });

  it('translates tools, tool calls and tool results', () => {
    const body = toAnthropicRequest(
      request({
        tools: [{ type: 'function', function: { name: 'get_refund', description: 'Look up', parameters: { type: 'object' } } }],
        tool_choice: 'required',
        messages: [
          { role: 'user', content: 'Refund?' },
          {
            role: 'assistant',
            content: null,
            tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_refund', arguments: '{"id":7}' } }],
          },
          { role: 'tool', tool_call_id: 'call_1', content: 'approved' },
        ],
      }),
      'm',
      false,
    );

    expect(body.tools).toEqual([{ name: 'get_refund', description: 'Look up', input_schema: { type: 'object' } }]);
    expect(body.tool_choice).toEqual({ type: 'any' });
    expect(body.messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Refund?' }] },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'call_1', name: 'get_refund', input: { id: 7 } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_1', content: 'approved' }] },
    ]);
  });

  it('translates images, clamps temperature and normalises stop', () => {
    const body = toAnthropicRequest(
      request({
        temperature: 1.7,
        stop: 'END',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is this?' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
            ],
          },
        ],
      }),
      'm',
      false,
    );

    expect(body.temperature).toBe(1);
    expect(body.stop_sequences).toEqual(['END']);
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is this?' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
        ],
      },
    ]);
  });

  it('asks for JSON through the system prompt', () => {
    const body = toAnthropicRequest(request({ response_format: { type: 'json_object' } }), 'm', false);

    expect(body.system).toContain('valid JSON');
  });

  it('rejects n > 1, which Anthropic cannot do', () => {
    expect(() => toAnthropicRequest(request({ n: 2 }), 'm', false)).toThrow(InvalidRequestError);
  });
});

describe('fromAnthropicResponse', () => {
  it('produces an OpenAI completion with usage and mapped stop reason', () => {
    const completion = fromAnthropicResponse({
      id: 'msg_1',
      model: 'claude-haiku-4-5',
      content: [{ type: 'text', text: 'Hello' }],
      stop_reason: 'max_tokens',
      usage: { input_tokens: 3, output_tokens: 2 },
    });

    expect(completion).toMatchObject({
      id: 'chatcmpl-msg_1',
      object: 'chat.completion',
      choices: [{ message: { role: 'assistant', content: 'Hello' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
    });
  });

  it('turns tool_use blocks into tool_calls', () => {
    const completion = fromAnthropicResponse({
      id: 'msg_2',
      model: 'm',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_refund', input: { id: 7 } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    expect(completion.choices[0]).toMatchObject({
      message: {
        content: null,
        tool_calls: [{ id: 'toolu_1', type: 'function', function: { name: 'get_refund', arguments: '{"id":7}' } }],
      },
      finish_reason: 'tool_calls',
    });
  });
});

describe('AnthropicStreamTranslator', () => {
  it('turns a text stream into OpenAI chunks ending in a usage chunk', () => {
    const translator = new AnthropicStreamTranslator();
    const chunks = [
      { type: 'message_start', message: { id: 'msg_1', model: 'm', usage: { input_tokens: 4 } } },
      { type: 'content_block_start', content_block: { type: 'text' } },
      { type: 'ping' },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Hel' } },
      { type: 'content_block_delta', delta: { type: 'text_delta', text: 'lo' } },
      { type: 'content_block_stop' },
      { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 2 } },
      { type: 'message_stop' },
    ].flatMap((event) => translator.translate(event));

    expect(chunks.map((c) => c.choices[0]?.delta.content ?? null)).toEqual(['', 'Hel', 'lo', null, null]);
    expect(chunks.at(-2)?.choices[0]?.finish_reason).toBe('stop');
    expect(chunks.at(-1)).toMatchObject({
      choices: [],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    });
  });

  it('streams tool call arguments under one tool index', () => {
    const translator = new AnthropicStreamTranslator();
    translator.translate({ type: 'message_start', message: { id: 'm', model: 'm' } });

    const [start] = translator.translate({
      type: 'content_block_start',
      content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_refund' },
    });
    const [delta] = translator.translate({
      type: 'content_block_delta',
      delta: { type: 'input_json_delta', partial_json: '{"id"' },
    });

    expect(start?.choices[0]?.delta).toEqual({
      tool_calls: [{ index: 0, id: 'toolu_1', type: 'function', function: { name: 'get_refund', arguments: '' } }],
    });
    expect(delta?.choices[0]?.delta).toEqual({ tool_calls: [{ index: 0, function: { arguments: '{"id"' } }] });
  });

  it('raises an in-stream error as a retryable upstream failure', () => {
    const translator = new AnthropicStreamTranslator();

    try {
      translator.translate({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(UpstreamError);
      expect((err as UpstreamError).retryable).toBe(true);
    }
  });
});
