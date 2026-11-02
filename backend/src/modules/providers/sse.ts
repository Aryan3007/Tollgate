export interface SseEvent {
  event?: string;
  data: string;
}

/**
 * Minimal SSE parser per the WHATWG spec. Network chunks can split lines and
 * events anywhere, so it buffers until a full line arrives.
 */
export async function* parseSse(
  body: AsyncIterable<Uint8Array>,
): AsyncGenerator<SseEvent> {
  const decoder = new TextDecoder();
  let buffer = '';
  let event: string | undefined;
  let data: string[] = [];

  function* processLine(rawLine: string): Generator<SseEvent> {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;

    if (line === '') {
      if (data.length > 0) yield { event, data: data.join('\n') };
      event = undefined;
      data = [];
      return;
    }
    if (line.startsWith(':')) return;

    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
  }

  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf('\n')) !== -1) {
      yield* processLine(buffer.slice(0, newline));
      buffer = buffer.slice(newline + 1);
    }
  }

  buffer += decoder.decode();
  if (buffer) yield* processLine(buffer);
  yield* processLine('');
}
