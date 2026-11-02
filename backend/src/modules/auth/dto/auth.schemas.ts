import { z } from 'zod';

export const loginSchema = z.strictObject({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});
export type LoginInput = z.output<typeof loginSchema>;
