import { parseSse, type SseEvent } from './sse.js';

async function collect(parts: string[]): Promise<SseEvent[]> {
  const encoder = new TextEncoder();
  async function* source() {
    for (const part of parts) yield encoder.encode(part);
  }
  const events: SseEvent[] = [];
  for await (const event of parseSse(source())) events.push(event);
  return events;
}

describe('parseSse', () => {
  it('parses events split across arbitrary network chunks', async () => {
    const raw = 'data: {"a":1}\n\ndata: {"b":2}\n\ndata: [DONE]\n\n';
    const chunked = raw.match(/.{1,3}/gs) ?? [];

    expect(await collect(chunked)).toEqual([
      { event: undefined, data: '{"a":1}' },
      { event: undefined, data: '{"b":2}' },
      { event: undefined, data: '[DONE]' },
    ]);
  });

  it('handles CRLF, comments, event names and multi-line data', async () => {
    const raw = ': keep-alive\r\nevent: message_start\r\ndata: line1\r\ndata: line2\r\n\r\n';

    expect(await collect([raw])).toEqual([{ event: 'message_start', data: 'line1\nline2' }]);
  });

  it('flushes a final event that has no trailing blank line', async () => {
    expect(await collect(['data: tail'])).toEqual([{ event: undefined, data: 'tail' }]);
  });

  it('decodes multi-byte characters split between chunks', async () => {
    const bytes = new TextEncoder().encode('data: ₹\n\n');
    async function* source() {
      yield bytes.slice(0, 7);
      yield bytes.slice(7);
    }
    const events: SseEvent[] = [];
    for await (const event of parseSse(source())) events.push(event);

    expect(events).toEqual([{ event: undefined, data: '₹' }]);
  });
});
