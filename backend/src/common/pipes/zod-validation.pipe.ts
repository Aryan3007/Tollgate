import { PipeTransform } from '@nestjs/common';
import type { z } from 'zod';
import { InvalidRequestError } from '../errors/gateway-error.js';

export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform<
  unknown,
  z.output<T>
> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const issue = result.error.issues[0];
    const param = issue?.path.length ? issue.path.join('.') : null;
    const message = issue
      ? `${param ?? 'body'}: ${issue.message}`
      : 'Invalid request';
    throw new InvalidRequestError(message, param);
  }
}
