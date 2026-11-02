import { z } from 'zod';

const commaList = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: commaList.default(['http://localhost:3000']),
    REQUEST_BODY_LIMIT: z.string().default('4mb'),
    SWAGGER_UI_ENABLED: z.stringbool().optional(),

    DATABASE_URL: z.url(),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(20),
    REDIS_URL: z.url(),

    KEY_PEPPER: z.string().min(32),
    JWT_ACCESS_SECRET: z.string().min(32),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    COOKIE_SECURE: z.stringbool().optional(),

    SECRET_STORE: z.enum(['env', 'azure']).default('env'),
    AZURE_KEYVAULT_URL: z.url().optional(),
    PROVIDER_KEY_OPENAI: z.string().min(1).optional(),
    PROVIDER_KEY_ANTHROPIC: z.string().min(1).optional(),
    PROVIDER_KEY_GROQ: z.string().min(1).optional(),

    /** Converts provider list prices (USD) into the ₹ budgets are kept in. */
    USD_INR_RATE: z.coerce.number().positive().default(88),
    /** How long a budget reservation lives if its request never settles (crash). */
    BUDGET_RESERVATION_TTL_SECONDS: z.coerce.number().int().min(30).default(900),
    /** Run BullMQ workers (log writer, budget sweeper) in this process. */
    WORKER_ENABLED: z.stringbool().default(true),
    LOG_BATCH_SIZE: z.coerce.number().int().min(1).max(5000).default(200),
    LOG_FLUSH_INTERVAL_MS: z.coerce.number().int().min(10).default(1000),

    /** Minimum cosine similarity for a semantic cache hit. Lower is riskier. */
    CACHE_SIMILARITY: z.coerce.number().min(0.5).max(1).default(0.95),
    EMBEDDER_MODEL: z.string().default('Xenova/all-MiniLM-L6-v2'),
    /** Where the embedding model is cached on disk (defaults to the library's own). */
    EMBEDDER_CACHE_DIR: z.string().optional(),
    /** How long a request may wait for an embedding before skipping the semantic cache. */
    EMBEDDER_TIMEOUT_MS: z.coerce.number().int().positive().default(500),

    UPSTREAM_TTFB_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30_000),
  })
  .refine((env) => env.SECRET_STORE !== 'azure' || env.AZURE_KEYVAULT_URL, {
    message: 'AZURE_KEYVAULT_URL is required when SECRET_STORE=azure',
    path: ['AZURE_KEYVAULT_URL'],
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // `KEY=` lines (as in .env.example) mean "not set", so defaults and
  // optional fields apply instead of failing validation on "".
  const present = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ''),
  );
  const result = envSchema.safeParse(present);
  if (!result.success) {
    throw new Error(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
