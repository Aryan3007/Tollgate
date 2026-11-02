import fc from 'fast-check';
import type { ChatCompletionChunk } from '../../providers/types.js';
import { detectPii, PII_ENTITIES } from '../detectors/index.js';
import { RedactionMap } from '../redaction-map.js';
import { redactText } from '../redactor.js';
import { ChunkRestorer } from './chunk-restorer.js';
import { StreamRestorer } from './stream-restorer.js';

const ALL = [...PII_ENTITIES];

/** Cuts `text` into pieces at the given positions (any chunking of the stream). */
function chunked(text: string, cuts: number[]): string[] {
  const points = [...new Set(cuts.map((c) => c % (text.length + 1)))].sort((a, b) => a - b);
  const pieces: string[] = [];
  let last = 0;
  for (const point of [...points, text.length]) {
    pieces.push(text.slice(last, point));
    last = point;
  }
  return pieces;
}

function streamThrough(restorer: StreamRestorer, pieces: string[]): string {
  return pieces.map((p) => restorer.push(p)).join('') + restorer.flush();
}

const PII_SNIPPETS = [
  'call 9876543210 now',
  'mail rahul.sharma@gmail.com',
  'pan ABCPE1234F',
  'card 4111 1111 1111 1111',
  '<not a placeholder>',
  'a < b and c > d',
];

describe('StreamRestorer', () => {
  it('restores a placeholder split across pieces', () => {
    const map = new RedactionMap();
    const placeholder = map.placeholderFor('phone', '9876543210');
    const restorer = new StreamRestorer(map);

    const out = streamThrough(restorer, ['Call ', '<PHO', 'NE_', '1', '> now']);

    expect(out).toBe('Call 9876543210 now');
    expect(placeholder).toBe('<PHONE_1>');
  });

  it('releases a "<" that turns out not to start a placeholder', () => {
    const map = new RedactionMap();
    map.placeholderFor('phone', '9876543210');
    const restorer = new StreamRestorer(map);

    expect(restorer.push('if a <')).toBe('if a ');
    expect(restorer.push(' b then')).toBe('< b then');
  });

  it('never holds more than a placeholder prefix back', () => {
    const map = new RedactionMap();
    map.placeholderFor('phone', '9876543210');
    const restorer = new StreamRestorer(map);

    restorer.push('text <AAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');

    expect(restorer.hasPending).toBe(true);
    expect(restorer.push(' and more')).toContain('and more');
  });

  it('leaves unknown placeholder-shaped text alone', () => {
    const map = new RedactionMap();
    map.placeholderFor('phone', '9876543210');

    expect(streamThrough(new StreamRestorer(map), ['see <PHONE_2> and <EMAIL_1>'])).toBe('see <PHONE_2> and <EMAIL_1>');
  });

  it('restores exactly for any text and any chunking (property)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.constantFrom(...PII_SNIPPETS), fc.string({ maxLength: 12 })), { maxLength: 8 }),
        fc.array(fc.nat({ max: 400 }), { maxLength: 40 }),
        (parts, cuts) => {
          const original = parts.join(' ');
          const map = new RedactionMap();
          const redacted = redactText(original, ALL, map);
          const randomChunks = streamThrough(new StreamRestorer(map), chunked(redacted, cuts));
          const oneCharChunks = streamThrough(new StreamRestorer(map), redacted.split(''));

          expect(randomChunks).toBe(original);
          expect(oneCharChunks).toBe(original);
        },
      ),
      { numRuns: 300 },
    );
  });
});

const chunk = (delta: ChatCompletionChunk['choices'][number]['delta'], finish: string | null = null): ChatCompletionChunk => ({
  id: 'c',
  object: 'chat.completion.chunk',
  created: 1,
  model: 'm',
  choices: [{ index: 0, delta, finish_reason: finish }],
});

describe('ChunkRestorer', () => {
  const setup = () => {
    const map = new RedactionMap();
    map.placeholderFor('phone', '9876543210');
    return new ChunkRestorer(map);
  };

  it('restores text split across chunks and flushes held text with the final chunk', () => {
    const restorer = setup();

    const out = [
      chunk({ role: 'assistant', content: '' }),
      chunk({ content: 'Call <PHO' }),
      chunk({ content: 'NE_1> or <PH' }),
      chunk({ content: '' }, 'stop'),
    ].map((c) => restorer.transform(c));

    expect(out.map((c) => c.choices[0]?.delta.content)).toEqual(['', 'Call ', '9876543210 or ', '<PH']);
    expect(out.at(-1)?.choices[0]?.finish_reason).toBe('stop');
  });

  it('restores tool-call arguments, keeping each tool call separate', () => {
    const restorer = setup();
    const call = (index: number, args: string) => chunk({ tool_calls: [{ index, function: { arguments: args } }] });

    const out = [call(0, '{"phone":"<PHONE'), call(1, '{"n":1}'), call(0, '_1>"}')]
      .map((c) => restorer.transform(c))
      .map((c) => (c.choices[0]!.delta.tool_calls as Array<{ function: { arguments: string } }>)[0]!.function.arguments);

    expect(out).toEqual(['{"phone":"', '{"n":1}', '9876543210"}']);
  });

  it('passes usage-only chunks and unmasked streams through untouched', () => {
    const usage: ChatCompletionChunk = { ...chunk({}), choices: [], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };

    expect(setup().transform(usage)).toEqual(usage);
    const plain = chunk({ content: 'hi <PHONE_1>' });
    expect(new ChunkRestorer(new RedactionMap()).transform(plain)).toBe(plain);
  });
});

describe('redactText', () => {
  it('uses one placeholder per distinct value and counts every replacement', () => {
    const map = new RedactionMap();

    const out = redactText('call 9876543210 or 9123456789, again 9876543210', ALL, map);

    expect(out).toBe('call <PHONE_1> or <PHONE_2>, again <PHONE_1>');
    expect(map.count).toBe(3);
    expect(map.restore(out)).toBe('call 9876543210 or 9123456789, again 9876543210');
  });

  it('finds nothing in text without PII', () => {
    const map = new RedactionMap();

    expect(redactText('hello there', ALL, map)).toBe('hello there');
    expect(map.isEmpty).toBe(true);
    expect(detectPii('hello there', ALL)).toEqual([]);
  });
});
