import type { ErrorRequestHandler, RequestHandler } from 'express';
import {
  GatewayError,
  RateLimitedError,
  type OpenAIErrorBody,
  type OpenAIErrorType,
} from '../errors/gateway-error.js';
import { createLogger } from '../logger.js';

function typeForStatus(status: number): OpenAIErrorType {
  if (status === 401) return 'authentication_error';
  if (status === 403) return 'permission_error';
  if (status === 429) return 'rate_limit_error';
  if (status >= 500) return 'api_error';
  return 'invalid_request_error';
}

function body(status: number, code: string, message: string): OpenAIErrorBody {
  return { error: { message, type: typeForStatus(status), code, param: null } };
}

/** body-parser (invalid JSON, payload too large) errors carry `status` and `type`. */
function isHttpError(err: unknown): err is { status: number; type: string; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof err.status === 'number' &&
    'type' in err &&
    typeof err.type === 'string'
  );
}

/** Unknown routes get the same error shape as every other failure. */
export const notFoundHandler: RequestHandler = (req) => {
  throw new GatewayError(404, 'invalid_request_error', 'http_404', `Cannot ${req.method} ${req.path}`);
};

/**
 * The one place errors become responses. Every failure, from a bad body to an
 * upstream outage, leaves as an OpenAI-shaped error so SDK clients parse it.
 */
export function createErrorHandler(): ErrorRequestHandler {
  const logger = createLogger('ErrorHandler');

  return (err: unknown, _req, res, _next) => {
    if (res.headersSent) {
      logger.error({ err }, 'Error after response started');
      res.end();
      return;
    }

    if (err instanceof GatewayError) {
      if (err.status >= 500) logger.error({ err }, err.message);
      if (err instanceof RateLimitedError) res.setHeader('retry-after', String(err.retryAfterSeconds));
      res.status(err.status).json(err.toBody());
      return;
    }

    if (isHttpError(err) && err.status < 500) {
      res.status(err.status).json(body(err.status, err.type.replaceAll('.', '_'), err.message));
      return;
    }

    logger.error({ err }, 'Unhandled error');
    res.status(500).json(body(500, 'internal_error', 'Internal server error'));
  };
}
