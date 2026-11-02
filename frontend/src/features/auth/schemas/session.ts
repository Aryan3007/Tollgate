import { z } from "zod";

export const adminSchema = z.object({
  id: z.uuid(),
  email: z.email(),
});
export type Admin = z.infer<typeof adminSchema>;

export const sessionSchema = z.object({
  accessToken: z.string().min(1),
  tokenType: z.literal("Bearer"),
  expiresIn: z.number().int().positive(),
  admin: adminSchema,
});
export type Session = z.infer<typeof sessionSchema>;

export const loginInputSchema = z.object({
  email: z.email("Enter a valid email address").max(254),
  password: z.string().min(1, "Enter your password").max(128),
});
export type LoginInput = z.infer<typeof loginInputSchema>;
