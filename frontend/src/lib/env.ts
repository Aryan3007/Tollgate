import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url(),
});

// NEXT_PUBLIC_* vars are inlined at build time only when referenced
// literally, so each one is listed explicitly instead of passing process.env.
export const env = envSchema.parse({
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
});
