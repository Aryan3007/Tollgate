import { z } from "zod";

export const providerHealthSchema = z.object({
  kind: z.enum(["openai", "anthropic", "groq"]),
  enabled: z.boolean(),
  configured: z.boolean(),
  breaker: z.enum(["closed", "open", "half_open"]),
  window: z.object({
    minutes: z.number().int(),
    requests: z.number().int(),
    errors: z.number().int(),
    p50Ms: z.number().nullable(),
    p95Ms: z.number().nullable(),
  }),
});
export type ProviderHealth = z.infer<typeof providerHealthSchema>;
