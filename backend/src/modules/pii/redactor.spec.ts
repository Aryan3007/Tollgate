import type { ChatCompletionRequest } from '../completions/dto/chat-completion-request.schema.js';
import type { ChatCompletion } from '../providers/types.js';
import { redactRequest, restoreCompletion } from './redactor.js';

const request = (messages: unknown[]) => ({ model: 'gpt-4o-mini', messages }) as ChatCompletionRequest;

describe('redactRequest', () => {
  it('masks string content, text parts and earlier tool-call arguments, without touching the original', () => {
    const original = request([
      { role: 'system', content: 'Support for rahul@gmail.com' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Call 9876543210' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,9876543210' } },
        ],
      },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: '1', type: 'function', function: { name: 'lookup', arguments: '{"pan":"ABCPE1234F"}' } }],
      },
    ]);

    const { request: masked, map } = redactRequest(original, ['email', 'phone', 'pan']);

    expect(masked.messages).toEqual([
      { role: 'system', content: 'Support for <EMAIL_1>' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Call <PHONE_1>' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,9876543210' } },
        ],
      },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: '1', type: 'function', function: { name: 'lookup', arguments: '{"pan":"<PAN_1>"}' } }],
      },
    ]);
    expect(map.count).toBe(3);
    expect(JSON.stringify(original)).toContain('rahul@gmail.com');
  });

  it('passes the request through unchanged when nothing is enabled', () => {
    const original = request([{ role: 'user', content: 'Call 9876543210' }]);

    const { request: masked, map } = redactRequest(original, []);

    expect(masked).toBe(original);
    expect(map.isEmpty).toBe(true);
  });

  it('only masks the enabled types', () => {
    const { request: masked } = redactRequest(request([{ role: 'user', content: 'a@b.com 9876543210' }]), ['email']);

    expect(masked.messages[0]?.content).toBe('<EMAIL_1> 9876543210');
  });
});

describe('restoreCompletion', () => {
  it('puts originals back in message text and tool-call arguments', () => {
    const { map } = redactRequest(request([{ role: 'user', content: 'Call 9876543210' }]), ['phone']);
    const completion = {
      id: 'x',
      object: 'chat.completion',
      created: 1,
      model: 'm',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: 'Dialling <PHONE_1>',
            tool_calls: [{ id: '1', type: 'function', function: { name: 'dial', arguments: '{"to":"<PHONE_1>"}' } }],
          },
          finish_reason: 'stop',
        },
      ],
    } as ChatCompletion;

    const restored = restoreCompletion(completion, map);

    expect(restored.choices[0]?.message).toMatchObject({
      content: 'Dialling 9876543210',
      tool_calls: [{ function: { arguments: '{"to":"9876543210"}' } }],
    });
  });
});
