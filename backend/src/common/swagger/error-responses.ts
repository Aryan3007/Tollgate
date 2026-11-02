import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { OpenAIErrorDto } from '../../modules/completions/dto/chat-completion.dto.js';

type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 413 | 422 | 429 | 500 | 502 | 503 | 504;

/** Documents each listed error status with the shared error body schema. */
export function ApiErrors(responses: Partial<Record<ErrorStatus, string>>) {
  return applyDecorators(
    ...Object.entries(responses).map(([status, description]) =>
      ApiResponse({ status: Number(status), description, type: OpenAIErrorDto }),
    ),
  );
}
