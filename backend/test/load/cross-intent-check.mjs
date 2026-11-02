// Safety check for the semantic cache: do prompts from DIFFERENT intents ever
// score above the similarity threshold? Any such pair would be served the
// other's answer. Uses the real embedding model.
import { pipeline } from '@huggingface/transformers';
import { INTENTS } from './support-intents.ts';

const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { dtype: 'fp32' });
const embed = async (s) => (await extractor(s, { pooling: 'mean', normalize: true })).data;
const cos = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);

const items = [];
for (const [intent, variants] of INTENTS.entries()) {
  for (const text of variants) items.push({ intent, text, v: await embed(text) });
}

const THRESHOLDS = [0.95, 0.9, 0.85, 0.8];
const crossHits = Object.fromEntries(THRESHOLDS.map((t) => [t, []]));
let sameIntentAbove = 0;
let sameIntentPairs = 0;
let maxCross = { s: 0, a: '', b: '' };
for (let i = 0; i < items.length; i++) {
  for (let j = i + 1; j < items.length; j++) {
    const s = cos(items[i].v, items[j].v);
    if (items[i].intent === items[j].intent) {
      sameIntentPairs++;
      if (s >= 0.95) sameIntentAbove++;
    } else {
      for (const t of THRESHOLDS) if (s >= t) crossHits[t].push([s, items[i].text, items[j].text]);
      if (s > maxCross.s) maxCross = { s, a: items[i].text, b: items[j].text };
    }
  }
}
console.log(`${items.length} prompts from ${INTENTS.length} intents`);
console.log(`same-intent pairs scoring >= 0.95: ${sameIntentAbove} of ${sameIntentPairs} (${((sameIntentAbove / sameIntentPairs) * 100).toFixed(1)}%)`);
for (const t of THRESHOLDS) console.log(`cross-intent pairs >= ${t}: ${crossHits[t].length}`);
console.log(`highest cross-intent score: ${maxCross.s.toFixed(3)}  "${String(maxCross.a)}"  vs  "${String(maxCross.b)}"`);
for (const [s, a, b] of crossHits[0.9].slice(0, 5)) console.log(`  ${s.toFixed(3)}  "${String(a)}"  vs  "${String(b)}"`);
