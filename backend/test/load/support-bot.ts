// Synthetic support-bot workload for measuring the semantic cache.
//
//   GATEWAY_URL=http://localhost:4000 GATEWAY_KEY=tg_live_... node test/load/support-bot.ts
//
// Real support traffic is dominated by a small set of repeated questions asked
// in slightly different words. This builds that shape: a few dozen intents,
// each phrased several ways, sampled with a skew so popular questions repeat.
// Treat the hit rate as a property of THIS synthetic mix, not of production.

import { INTENTS } from './support-intents.ts';

const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://localhost:4000';
const GATEWAY_KEY = process.env.GATEWAY_KEY ?? '';
const MODEL = process.env.MODEL ?? 'gpt-4o-mini';
const REQUESTS = Number(process.env.REQUESTS ?? 600);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);

if (!GATEWAY_KEY) throw new Error('Set GATEWAY_KEY to a virtual key');

const SYSTEM = 'You are a concise support assistant for an online store. Answer in two sentences at most.';

/** Light surface changes people make without changing the meaning. */
const TWEAKS: Array<(q: string) => string> = [
  (q) => q,
  (q) => q,
  (q) => q.toLowerCase(),
  (q) => q.replace(/[?.!]+$/, ''),
  (q) => `Hi, ${q.charAt(0).toLowerCase()}${q.slice(1)}`,
  (q) => `${q} Thanks!`,
  (q) => `Please help: ${q}`,
];

let seed = 7;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

function nextQuestion(): string {
  // Skewed pick: low-numbered intents are much more popular.
  const intent = INTENTS[Math.floor(random() ** 2 * INTENTS.length)]!;
  // The canonical wording is the most common, as in real traffic.
  const wording = random() < 0.35 ? intent[0]! : intent[Math.floor(random() * intent.length)]!;
  return TWEAKS[Math.floor(random() * TWEAKS.length)]!(wording);
}

interface Result {
  cache: string;
  ms: number;
  status: number;
}

async function ask(question: string): Promise<Result> {
  const started = performance.now();
  const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${GATEWAY_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      max_tokens: 80,
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: question },
      ],
    }),
  });
  await res.arrayBuffer();
  return { cache: res.headers.get('x-tollgate-cache') ?? 'none', ms: performance.now() - started, status: res.status };
}

const questions = Array.from({ length: REQUESTS }, nextQuestion);
const results: Result[] = [];
let cursor = 0;

async function worker(): Promise<void> {
  while (cursor < questions.length) {
    const question = questions[cursor++]!;
    results.push(await ask(question));
  }
}

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]! : NaN;
};
const summary = (label: string, rows: Result[]) =>
  `${label.padEnd(15)} n=${String(rows.length).padStart(4)}  p50=${percentile(rows.map((r) => r.ms), 0.5).toFixed(0).padStart(5)} ms  p95=${percentile(rows.map((r) => r.ms), 0.95).toFixed(0).padStart(5)} ms`;

const startedAt = performance.now();
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
const seconds = (performance.now() - startedAt) / 1000;

const ok = results.filter((r) => r.status === 200);
const exact = ok.filter((r) => r.cache === 'hit-exact');
const semantic = ok.filter((r) => r.cache === 'hit-semantic');
const misses = ok.filter((r) => r.cache === 'miss');
const hits = exact.length + semantic.length;

console.log(`\n${REQUESTS} requests, ${new Set(questions).size} distinct prompts, ${INTENTS.length} intents, ${seconds.toFixed(1)}s`);
console.log(`non-200 responses: ${results.length - ok.length}`);
console.log(`hit rate: ${((hits / ok.length) * 100).toFixed(1)}%  (exact ${exact.length}, semantic ${semantic.length}, miss ${misses.length})`);
console.log(summary('miss', misses));
console.log(summary('exact hit', exact));
console.log(summary('semantic hit', semantic));
