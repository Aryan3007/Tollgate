import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

// Fake OpenAI and Anthropic upstream for e2e tests and k6 load runs. Kept to erasable
// TypeScript so Node can run it directly (`pnpm mock:provider`).

export interface MockBehavior {
  /** Delay before response headers are sent. */
  latencyMs: number;
  /** Delay between streamed chunks. */
  chunkDelayMs: number;
  /** Characters per streamed chunk. */
  chunkSize: number;
  /** When set, every request fails with this status. */
  failStatus: number | null;
  /** Fixed reply text; null echoes the last user message. */
  reply: string | null;
}

export interface MockProvider {
  url: string;
  behavior: MockBehavior;
  requests: Array<Record<string, unknown>>;
  /** Requests whose client went away before the response finished. */
  aborted: number;
  close(): Promise<void>;
}

const DEFAULTS: MockBehavior = {
  latencyMs: 0,
  chunkDelayMs: 0,
  chunkSize: 4,
  failStatus: null,
  reply: 'Hello from the mock provider.',
};

const sleep = (ms: number) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

const countTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

function lastUserText(body: Record<string, unknown>): string {
  const messages = (body.messages ?? []) as Array<{ role: string; content: unknown }>;
  const last = [...messages].reverse().find((m) => m.role === 'user');
  return typeof last?.content === 'string' ? last.content : '';
}

async function sendAnthropic(
  res: ServerResponse,
  body: Record<string, unknown>,
  reply: string,
  inputTokens: number,
  b: MockBehavior,
): Promise<void> {
  const outputTokens = countTokens(reply);
  if (!body.stream) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'msg_mock',
        type: 'message',
        role: 'assistant',
        model: body.model,
        content: [{ type: 'text', text: reply }],
        stop_reason: 'end_turn',
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      }),
    );
    return;
  }

  const send = (type: string, payload: object) =>
    res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}\n\n`);
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  send('message_start', { message: { id: 'msg_mock', model: body.model, usage: { input_tokens: inputTokens } } });
  send('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  for (let i = 0; i < reply.length; i += b.chunkSize) {
    await sleep(b.chunkDelayMs);
    if (res.destroyed) return;
    send('content_block_delta', { index: 0, delta: { type: 'text_delta', text: reply.slice(i, i + b.chunkSize) } });
  }
  send('content_block_stop', { index: 0 });
  send('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: outputTokens } });
  send('message_stop', {});
  res.end();
}

export async function startMockProvider(
  overrides: Partial<MockBehavior> = {},
  port = 0,
): Promise<MockProvider> {
  const state: MockProvider = {
    url: '',
    behavior: { ...DEFAULTS, ...overrides },
    requests: [],
    aborted: 0,
    close: () => Promise.resolve(),
  };

  const handle = async (req: IncomingMessage, res: ServerResponse) => {
    const anthropic = req.method === 'POST' && req.url === '/v1/messages';
    if (!anthropic && (req.method !== 'POST' || req.url !== '/v1/chat/completions')) {
      res.writeHead(404).end();
      return;
    }
    if (anthropic ? !req.headers['x-api-key'] : !req.headers.authorization?.startsWith('Bearer ')) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Missing API key', type: 'invalid_request_error' } }));
      return;
    }

    const body = await readJson(req);
    state.requests.push(body);
    res.on('close', () => {
      if (!res.writableFinished) state.aborted += 1;
    });

    const b = state.behavior;
    await sleep(b.latencyMs);
    if (res.destroyed) return;

    if (b.failStatus) {
      res.writeHead(b.failStatus, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: `Mock failure ${b.failStatus}`, type: 'server_error' } }));
      return;
    }

    const prompt = lastUserText(body);
    const reply = b.reply ?? prompt;
    if (anthropic) {
      await sendAnthropic(res, body, reply, countTokens(prompt), b);
      return;
    }
    const usage = {
      prompt_tokens: countTokens(prompt),
      completion_tokens: countTokens(reply),
      total_tokens: countTokens(prompt) + countTokens(reply),
    };
    const base = { id: `chatcmpl-mock-${state.requests.length}`, created: Math.floor(Date.now() / 1000), model: String(body.model) };

    if (!body.stream) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          ...base,
          object: 'chat.completion',
          choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
          usage,
        }),
      );
      return;
    }

    const includeUsage = (body.stream_options as { include_usage?: boolean } | undefined)?.include_usage === true;
    const send = (payload: unknown) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
    const chunk = (delta: Record<string, unknown>, finish: string | null) => ({
      ...base,
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta, finish_reason: finish }],
      ...(includeUsage ? { usage: null } : {}),
    });

    res.writeHead(200, { 'content-type': 'text/event-stream' });
    send(chunk({ role: 'assistant', content: '' }, null));
    for (let i = 0; i < reply.length; i += b.chunkSize) {
      await sleep(b.chunkDelayMs);
      if (res.destroyed) return;
      send(chunk({ content: reply.slice(i, i + b.chunkSize) }, null));
    }
    send(chunk({}, 'stop'));
    if (includeUsage) send({ ...base, object: 'chat.completion.chunk', choices: [], usage });
    res.end('data: [DONE]\n\n');
  };

  const server = createServer((req, res) => {
    handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  const { port: actualPort } = server.address() as AddressInfo;
  state.url = `http://127.0.0.1:${actualPort}/v1`;
  state.close = () =>
    new Promise((resolve, reject) => {
      server.closeAllConnections();
      server.close((err) => (err ? reject(err) : resolve()));
    });
  return state;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const mock = await startMockProvider(
    {
      latencyMs: Number(process.env.MOCK_LATENCY_MS ?? 0),
      chunkDelayMs: Number(process.env.MOCK_CHUNK_DELAY_MS ?? 0),
    },
    Number(process.env.PORT ?? 4010),
  );
  console.log(`Mock provider listening at ${mock.url}`);
}
