import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  GatewayError,
  RateLimitedError,
  type OpenAIErrorBody,
  type OpenAIErrorType,
} from '../errors/gateway-error.js';

function typeForStatus(status: number): OpenAIErrorType {
  if (status === 401) return 'authentication_error';
  if (status === 403) return 'permission_error';
  if (status === 429) return 'rate_limit_error';
  if (status >= 500) return 'api_error';
  return 'invalid_request_error';
}

function body(
  status: number,
  code: string,
  message: string,
): OpenAIErrorBody {
  return {
    error: { message, type: typeForStatus(status), code, param: null },
  };
}

/** Express body-parser errors carry `status` and `type` but are not HttpExceptions. */
function isBodyParserError(
  err: unknown,
): err is { status: number; type: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof err.status === 'number' &&
    'type' in err &&
    typeof err.type === 'string'
  );
}

@Catch()
export class GatewayExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GatewayExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (res.headersSent) {
      this.logger.error({ err: exception }, 'Error after response started');
      res.end();
      return;
    }

    if (exception instanceof GatewayError) {
      if (exception.status >= 500) {
        this.logger.error({ err: exception }, exception.message);
      }
      if (exception instanceof RateLimitedError) {
        res.setHeader('retry-after', String(exception.retryAfterSeconds));
      }
      res.status(exception.status).json(exception.toBody());
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res
        .status(status)
        .json(body(status, `http_${status}`, exception.message));
      return;
    }

    if (isBodyParserError(exception) && exception.status < 500) {
      res
        .status(exception.status)
        .json(
          body(
            exception.status,
            exception.type.replaceAll('.', '_'),
            exception.message,
          ),
        );
      return;
    }

    this.logger.error({ err: exception }, 'Unhandled error');
    res.status(500).json(body(500, 'internal_error', 'Internal server error'));
  }
}
