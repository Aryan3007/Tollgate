import { z } from "zod";

export const CACHE_RESULTS = [
  "hit-exact",
  "hit-semantic",
  "miss",
  "skip",
] as const;
export type CacheResult = (typeof CACHE_RESULTS)[number];

/** What one request cost and saved, as the gateway reports it (money in micro-rupees). */
export const callStatsSchema = z.object({
  cache: z.enum(CACHE_RESULTS),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  savedTokens: z.number().int(),
  costMicroInr: z.number(),
  savedMicroInr: z.number(),
  redactions: z.number().int(),
  failovers: z.number().int(),
  latencyMs: z.number(),
});
export type CallStats = z.infer<typeof callStatsSchema>;

export const completionSchema = z.object({
  choices: z
    .array(z.object({ message: z.object({ content: z.string().nullable() }) }))
    .min(1),
});

export const streamChunkSchema = z.object({
  choices: z
    .array(z.object({ delta: z.object({ content: z.string().nullish() }) }))
    .optional(),
  error: z
    .object({ message: z.string(), code: z.string().optional() })
    .optional(),
});

export const modelListSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

export const errorBodySchema = z.object({
  error: z.object({ message: z.string(), code: z.string().optional() }),
});

export const virtualKeySchema = z
  .string()
  .trim()
  .regex(
    /^tg_live_[0-9A-Za-z]{32}$/,
    "A virtual key is tg_live_ followed by 32 letters and digits",
  );

/** The form's numeric fields arrive as strings. */
export const temperatureSchema = z
  .string()
  .trim()
  .regex(/^(|\d(\.\d{1,2})?)$/, "Enter 0 to 2, like 0 or 0.7")
  .refine((v) => v === "" || Number(v) <= 2, "Maximum is 2");

export const maxTokensSchema = z
  .string()
  .trim()
  .regex(/^\d{1,4}$/, "Enter a whole number up to 9999")
  .refine((v) => Number(v) >= 1, "Minimum is 1");
