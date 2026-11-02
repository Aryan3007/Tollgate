import type { z } from "zod";

export type FormErrors<T> = Partial<Record<keyof T, string>>;

/** First error message per top-level field. */
export function fieldErrors<T>(error: z.ZodError): FormErrors<T> {
  const errors: FormErrors<T> = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof T | undefined;
    if (key !== undefined && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
