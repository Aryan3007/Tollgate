import { z } from "zod";

export const KEY_STATUSES = ["active", "revoked", "expired"] as const;
export type KeyStatus = (typeof KEY_STATUSES)[number];

export const usageSchema = z.object({
  requests: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  costMicroInr: z.number(),
});
export type Usage = z.infer<typeof usageSchema>;

export const keySchema = z.object({
  id: z.uuid(),
  teamId: z.uuid(),
  teamName: z.string(),
  name: z.string(),
  prefix: z.string(),
  allowedModels: z.array(z.string()),
  rpmLimit: z.number().int().nullable(),
  tpmLimit: z.number().int().nullable(),
  status: z.enum(KEY_STATUSES),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  createdAt: z.string(),
  usage: usageSchema,
});
export type VirtualKey = z.infer<typeof keySchema>;

export const createdKeySchema = z.object({
  key: keySchema,
  secret: z.string().startsWith("tg_live_"),
});
export type CreatedKey = z.infer<typeof createdKeySchema>;

export const catalogModelSchema = z.object({
  alias: z.string(),
  upstreamName: z.string(),
  providerKind: z.enum(["openai", "anthropic", "groq"]),
  inputUsdPerMtok: z.number(),
  outputUsdPerMtok: z.number(),
  supportsJson: z.boolean(),
  supportsTools: z.boolean(),
});
export type CatalogModel = z.infer<typeof catalogModelSchema>;

const optionalInt = (max: number, label: string) =>
  z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^\d+$/.test(v),
      `${label} must be a whole number`,
    )
    .transform((v) => (v === "" ? undefined : Number(v)))
    .pipe(
      z
        .number()
        .int()
        .min(1, "Minimum is 1")
        .max(max, `Maximum is ${max.toLocaleString("en-IN")}`)
        .optional(),
    );

/** Form state is all strings; this turns it into the API body. */
export const keyFormSchema = z.object({
  teamId: z.string().min(1, "Choose a team"),
  name: z
    .string()
    .trim()
    .min(1, "Enter a name")
    .max(100, "100 characters at most"),
  allowedModels: z
    .array(z.string())
    .min(1, "Choose at least one model")
    .max(50),
  rpmLimit: optionalInt(100_000, "Requests per minute"),
  tpmLimit: optionalInt(100_000_000, "Tokens per minute"),
  expiresOn: z
    .string()
    .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Pick a date")
    // A key "expiring on" a date stays valid until the end of that day, local time.
    .transform((v) => (v === "" ? undefined : new Date(`${v}T23:59:59`)))
    .refine(
      (d) => d === undefined || d.getTime() > Date.now(),
      "Pick a date in the future",
    ),
});
export type KeyFormValues = z.input<typeof keyFormSchema>;
