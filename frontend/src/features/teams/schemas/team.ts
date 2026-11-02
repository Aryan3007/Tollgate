import { z } from "zod";
import { usageSchema } from "@/features/keys/schemas/key";

export const PII_TYPES = [
  { value: "aadhaar", label: "Aadhaar number" },
  { value: "pan", label: "PAN" },
  { value: "phone", label: "Phone number" },
  { value: "card", label: "Card number" },
  { value: "email", label: "Email address" },
] as const;
export type PiiType = (typeof PII_TYPES)[number]["value"];
const piiValues = PII_TYPES.map((t) => t.value) as [PiiType, ...PiiType[]];

export const teamSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  monthlyBudgetMicroInr: z.number().int(),
  rpmLimit: z.number().int(),
  tpmLimit: z.number().int(),
  defaultMaxTokens: z.number().int(),
  piiEntities: z.array(z.enum(piiValues)),
  cacheEnabled: z.boolean(),
  cacheMaxTemperature: z.number(),
  cacheTtlSeconds: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  usage: usageSchema,
});
export type Team = z.infer<typeof teamSchema>;

const intField = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} must be a whole number`)
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(min, `Minimum is ${min}`)
        .max(max, `Maximum is ${max.toLocaleString("en-IN")}`),
    );

/** What the create-team form holds: strings straight from the inputs. */
export const teamFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a team name")
    .max(100, "100 characters at most"),
  monthlyBudgetInr: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 5000 or 5000.50")
    .transform(Number)
    .pipe(z.number().min(0).max(1_000_000_000, "Maximum is ₹1,00,00,00,000")),
  rpmLimit: intField(1, 100_000, "Requests per minute"),
  tpmLimit: intField(1, 100_000_000, "Tokens per minute"),
  defaultMaxTokens: intField(1, 200_000, "Default max tokens"),
  piiEntities: z.array(z.enum(piiValues)),
  cacheEnabled: z.boolean(),
  cacheMaxTemperature: z
    .string()
    .trim()
    .regex(/^\d(\.\d{1,2})?$/, "Enter a number from 0 to 2, like 0 or 0.5")
    .transform(Number)
    .pipe(z.number().min(0).max(2, "Maximum is 2")),
});
export type TeamFormValues = z.input<typeof teamFormSchema>;
export type TeamFormOutput = z.output<typeof teamFormSchema>;

export type UpdateTeamInput = Partial<CreateTeamInput>;

export interface CreateTeamInput {
  name: string;
  monthlyBudgetMicroInr: number;
  rpmLimit: number;
  tpmLimit: number;
  defaultMaxTokens: number;
  piiEntities: PiiType[];
  cacheEnabled: boolean;
  cacheMaxTemperature: number;
}
