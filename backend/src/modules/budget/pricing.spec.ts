import type { ChatCompletionRequest } from '../completions/dto/chat-completion-request.schema.js';
import {
  actualCostMicroInr,
  estimatedCostMicroInr,
  estimateInputTokens,
  maxOutputTokens,
} from './pricing.js';

const request = (overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest => ({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'x'.repeat(300) }],
  ...overrides,
});

describe('pricing', () => {
  it('estimates input tokens pessimistically from characters plus per-message overhead', () => {
    expect(estimateInputTokens(request())).toBe(100 + 4);
  });

  it('counts text inside content-part arrays and tool definitions', () => {
    const req = request({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'abcdef' }, { type: 'image_url' }] }],
      tools: [{ type: 'function' }],
    } as Partial<ChatCompletionRequest>);

    expect(estimateInputTokens(req)).toBe(2 + Math.ceil(JSON.stringify([{ type: 'function' }]).length / 3) + 4);
  });

  it('uses the request output cap, falling back to the team default, times n', () => {
    expect(maxOutputTokens(request({ max_tokens: 50 }), 1024)).toBe(50);
    expect(maxOutputTokens(request({ max_completion_tokens: 70, max_tokens: 50 }), 1024)).toBe(70);
    expect(maxOutputTokens(request({ n: 2 }), 1024)).toBe(2048);
  });

  it('prices tokens in micro-rupees: USD/Mtok × INR/USD is micro-rupees per token', () => {
    const price = { inputUsdPerMtok: 0.15, outputUsdPerMtok: 0.6 };

    // 1,000 in × 0.15 + 500 out × 0.6 = 450 micro-USD → × 88 = 39,600 micro-rupees (₹0.0396)
    expect(actualCostMicroInr({ inputTokens: 1000, outputTokens: 500 }, price, 88)).toBe(39_600);
  });

  it('rounds estimates up and actual costs to the nearest micro-rupee', () => {
    const price = { inputUsdPerMtok: 0.15, outputUsdPerMtok: 0 };

    expect(estimatedCostMicroInr({ inputTokens: 1, outputTokens: 0 }, price, 1)).toBe(1);
    expect(actualCostMicroInr({ inputTokens: 1, outputTokens: 0 }, price, 1)).toBe(0);
  });
});
