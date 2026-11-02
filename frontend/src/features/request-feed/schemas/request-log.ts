import { z } from "zod";

export const requestLogSchema = z.object({
  id: z.uuid(),
  requestId: z.string(),
  teamId: z.uuid(),
  keyId: z.uuid(),
  keyName: z.string().nullable(),
  keyPrefix: z.string().nullable(),
  teamName: z.string().nullable(),
  requestedModel: z.string(),
  provider: z.enum(["openai", "anthropic", "groq"]).nullable(),
  servedModel: z.string().nullable(),
  streamed: z.boolean(),
  statusCode: z.number().int(),
  errorCode: z.string().nullable(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costMicroInr: z.number(),
  latencyMs: z.number().int(),
  ttfbMs: z.number().int().nullable(),
  cacheStatus: z.string(),
  savedMicroInr: z.number(),
  failoverCount: z.number().int(),
  redactionCount: z.number().int(),
  createdAt: z.string(),
});
export type RequestLog = z.infer<typeof requestLogSchema>;
