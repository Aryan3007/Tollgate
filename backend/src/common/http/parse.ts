import type { z } from 'zod';
import { InvalidRequestError } from '../errors/gateway-error.js';

/**
 * Validates untrusted input (body, query or params) against a Zod schema and
 * returns the parsed value, or throws a 400 naming the first bad field.
 * Controllers call this before anything else, so no logic runs on bad input.
 */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  const param = issue?.path.length ? issue.path.join('.') : null;
  const message = issue ? `${param ?? 'body'}: ${issue.message}` : 'Invalid request';
  throw new InvalidRequestError(message, param);
}

/** Express 5 leaves req.body undefined when the request has no body. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  return parse(schema, body ?? {});
}
