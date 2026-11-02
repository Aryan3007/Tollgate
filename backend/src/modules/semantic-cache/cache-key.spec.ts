import type { ChatCompletionRequest } from '../completions/dto/chat-completion-request.schema.js';
import {
  canonicalJson,
  exactCacheKey,
  ineligibleReason,
  guardTokens,
  semanticTarget,
  SEMANTIC_MAX_CHARS,
  type CachePolicy,
} from './cache-key.js';

const policy: CachePolicy = { enabled: true, maxTemperature: 0, ttlSeconds: 3600 };
const req = (overrides: Record<string, unknown> = {}) =>
  ({ model: 'gpt-4o-mini', temperature: 0, messages: [{ role: 'user', content: 'hello' }], ...overrides }) as ChatCompletionRequest;

describe('ineligibleReason', () => {
  it('allows a deterministic request', () => {
    expect(ineligibleReason(req(), policy, 0)).toBeNull();
  });

  it.each([
    ['team has caching off', req(), { ...policy, enabled: false }, 0, 'disabled_for_team'],
    ['personal data was masked', req(), policy, 1, 'pii_masked'],
    ['tools are used', req({ tools: [{ type: 'function' }] }), policy, 0, 'tools'],
    ['several choices are requested', req({ n: 2 }), policy, 0, 'multiple_choices'],
    ['temperature is above the limit', req({ temperature: 0.2 }), policy, 0, 'temperature'],
    ['temperature is omitted (provider default is 1)', req({ temperature: undefined }), policy, 0, 'temperature'],
  ])('refuses when %s', (_label, request, p, redactions, reason) => {
    expect(ineligibleReason(request, p, redactions)).toBe(reason);
  });

  it('accepts an omitted temperature once the team allows 1', () => {
    expect(ineligibleReason(req({ temperature: undefined }), { ...policy, maxTemperature: 1 }, 0)).toBeNull();
  });
});

describe('canonicalJson', () => {
  it('ignores key order and undefined values', () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { y: 1, x: 2 }], c: undefined } })).toBe(canonicalJson({ a: { d: [1, { x: 2, y: 1 }] }, b: 1 }));
  });

  it('keeps array order, which is meaningful', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe('exactCacheKey', () => {
  it('is stable across key order, and ignores fields that do not change the answer', () => {
    const a = exactCacheKey('t1', req());
    const b = exactCacheKey('t1', { messages: [{ role: 'user', content: 'hello' }], temperature: 0, model: 'gpt-4o-mini', stream: true, user: 'u-1', stream_options: { include_usage: true } } as ChatCompletionRequest);

    expect(a).toBe(b);
  });

  it('differs by team, model, message or any parameter', () => {
    const base = exactCacheKey('t1', req());

    expect(exactCacheKey('t2', req())).not.toBe(base);
    expect(exactCacheKey('t1', req({ model: 'gpt-4o' }))).not.toBe(base);
    expect(exactCacheKey('t1', req({ messages: [{ role: 'user', content: 'hello!' }] }))).not.toBe(base);
    expect(exactCacheKey('t1', req({ max_tokens: 5 }))).not.toBe(base);
    expect(exactCacheKey('t1', req({ seed: 1 }))).not.toBe(base);
  });
});

describe('semanticTarget', () => {
  it('embeds only the final user message', () => {
    const target = semanticTarget('t1', req({ messages: [{ role: 'system', content: 'Be brief' }, { role: 'user', content: '  Refund policy?  ' }] }));

    expect(target?.text).toBe('Refund policy?');
  });

  it('shares a scope across different final messages, but not across anything else', () => {
    const withLast = (text: string, extra: Record<string, unknown> = {}, team = 't1') =>
      semanticTarget(team, req({ messages: [{ role: 'system', content: 'Be brief' }, { role: 'user', content: text }], ...extra }))!.scope;

    expect(withLast('refund policy?')).toBe(withLast('what is the refund policy'));
    expect(withLast('refund policy?', {}, 't2')).not.toBe(withLast('refund policy?'));
    expect(withLast('refund policy?', { model: 'gpt-4o' })).not.toBe(withLast('refund policy?'));
    expect(withLast('refund policy?', { max_tokens: 9 })).not.toBe(withLast('refund policy?'));
    expect(semanticTarget('t1', req({ messages: [{ role: 'system', content: 'Other' }, { role: 'user', content: 'refund policy?' }] }))!.scope).not.toBe(withLast('refund policy?'));
  });

  it('is not used for prompts too long for the model, or when the last turn is not user text', () => {
    const long = (n: number) => req({ messages: [{ role: 'user', content: 'x'.repeat(n) }] });

    expect(semanticTarget('t1', long(SEMANTIC_MAX_CHARS))).not.toBeNull();
    expect(semanticTarget('t1', long(SEMANTIC_MAX_CHARS + 1))).toBeNull();
    expect(semanticTarget('t1', req({ messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }] }))).toBeNull();
    expect(semanticTarget('t1', req({ messages: [{ role: 'user', content: [{ type: 'image_url' }] }] }))).toBeNull();
    expect(semanticTarget('t1', req({ messages: [{ role: 'user', content: '   ' }] }))).toBeNull();
  });
});

describe('guardTokens', () => {
  it('collects numbers (ignoring thousands separators) and meaning-flipping words, order-independent', () => {
    expect(guardTokens('Transfer 5,000 rupees, don’t exceed 20.5')).toBe(guardTokens('dont exceed 20.5, transfer 5000 rupees'));
    expect(guardTokens('Transfer 5000 rupees')).toBe('5000');
  });

  it('is empty for plain wording changes', () => {
    expect(guardTokens('How do I reset my password?')).toBe('');
    expect(guardTokens('hi, reset password please')).toBe('');
  });
});

describe('semantic scope guards', () => {
  const scopeOf = (text: string) => semanticTarget('t1', req({ messages: [{ role: 'user', content: text }] }))!.scope;

  it('separates prompts that differ only in a number', () => {
    expect(scopeOf('Transfer 5000 rupees to Rahul')).not.toBe(scopeOf('Transfer 50000 rupees to Rahul'));
  });

  it('separates a request from its negation or exclusion', () => {
    expect(scopeOf('Does the plan include GST?')).toBe(scopeOf('does the plan include gst'));
    expect(scopeOf('Does the plan include GST?')).not.toBe(scopeOf('Does the plan exclude GST?'));
    expect(scopeOf('I want to delete my account')).not.toBe(scopeOf("I don't want to delete my account"));
  });

  it('still groups ordinary rewordings', () => {
    expect(scopeOf('How do I reset my password?')).toBe(scopeOf('Hi, how do I reset my password? Thanks!'));
  });
});

