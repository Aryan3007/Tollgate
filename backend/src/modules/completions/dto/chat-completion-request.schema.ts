import { z } from 'zod';

const contentPart = z.looseObject({
  type: z.string().min(1).max(64),
});

const message = z.looseObject({
  role: z.enum(['system', 'developer', 'user', 'assistant', 'tool']),
  content: z
    .union([z.string().max(1_000_000), z.array(contentPart).max(256), z.null()])
    .optional(),
  name: z.string().min(1).max(64).optional(),
});

/**
 * Validates the fields the gateway acts on. Loose objects keep every other
 * OpenAI parameter (tools, response_format, seed, ...) and pass it upstream.
 */
export const chatCompletionRequestSchema = z.looseObject({
  model: z.string().min(1).max(128),
  messages: z.array(message).min(1).max(2048),
  stream: z.boolean().nullish(),
  stream_options: z
    .looseObject({ include_usage: z.boolean().optional() })
    .nullish(),
  temperature: z.number().min(0).max(2).nullish(),
  max_tokens: z.number().int().positive().nullish(),
  max_completion_tokens: z.number().int().positive().nullish(),
  n: z.number().int().min(1).max(8).nullish(),
});

export type ChatCompletionRequest = z.output<
  typeof chatCompletionRequestSchema
>;
