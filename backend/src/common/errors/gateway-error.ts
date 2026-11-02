export type OpenAIErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'permission_error'
  | 'rate_limit_error'
  | 'insufficient_quota'
  | 'api_error';

export interface OpenAIErrorBody {
  error: {
    message: string;
    type: OpenAIErrorType;
    code: string;
    param: string | null;
  };
}

/**
 * Base for every error the gateway raises on purpose. All endpoints (gateway
 * and admin) use the OpenAI error shape so clients parse one format.
 */
export class GatewayError extends Error {
  constructor(
    readonly status: number,
    readonly type: OpenAIErrorType,
    readonly code: string,
    message: string,
    readonly param: string | null = null,
  ) {
    super(message);
    this.name = new.target.name;
  }

  toBody(): OpenAIErrorBody {
    return {
      error: {
        message: this.message,
        type: this.type,
        code: this.code,
        param: this.param,
      },
    };
  }
}

export class InvalidRequestError extends GatewayError {
  constructor(message: string, param: string | null = null) {
    super(400, 'invalid_request_error', 'invalid_request', message, param);
  }
}

export class UnauthorizedError extends GatewayError {
  constructor(code: string, message: string) {
    super(401, 'authentication_error', code, message);
  }
}

export class ForbiddenError extends GatewayError {
  constructor(code: string, message: string) {
    super(403, 'permission_error', code, message);
  }
}

export class NotFoundError extends GatewayError {
  constructor(resource: string, code = 'not_found') {
    super(404, 'invalid_request_error', code, `${resource} not found`);
  }
}

export class ConflictError extends GatewayError {
  constructor(code: string, message: string, param: string | null = null) {
    super(409, 'invalid_request_error', code, message, param);
  }
}

/** The request is well-formed but references something that does not exist. */
export class UnprocessableError extends GatewayError {
  constructor(code: string, message: string, param: string | null = null) {
    super(422, 'invalid_request_error', code, message, param);
  }
}

export class RateLimitedError extends GatewayError {
  constructor(
    message: string,
    /** Sent as the Retry-After header. */
    readonly retryAfterSeconds: number,
  ) {
    super(429, 'rate_limit_error', 'rate_limit_exceeded', message);
  }
}

export class ProviderNotConfiguredError extends GatewayError {
  constructor(provider: string) {
    super(
      503,
      'api_error',
      'provider_not_configured',
      `Provider "${provider}" is not configured`,
    );
  }
}

export class ServiceUnavailableError extends GatewayError {
  constructor(code: string, message: string) {
    super(503, 'api_error', code, message);
  }
}

export class AllProvidersFailedError extends GatewayError {
  constructor(attempted: string[]) {
    super(
      503,
      'api_error',
      'all_providers_failed',
      `Every provider for this model failed (tried ${attempted.join(', ')})`,
    );
  }
}
