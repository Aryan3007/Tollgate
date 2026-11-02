import { GatewayError } from '../../common/errors/gateway-error.js';
import type { ProviderKind } from './types.js';

/**
 * `retryable` tells the failover layer whether another provider might succeed.
 * Client mistakes (bad params) are not retryable; outages and bad upstream
 * credentials are.
 */
export class UpstreamError extends GatewayError {
  constructor(
    readonly provider: ProviderKind,
    readonly retryable: boolean,
    status: number,
    code: string,
    message: string,
  ) {
    super(
      status,
      status === 429
        ? 'rate_limit_error'
        : status >= 500
          ? 'api_error'
          : 'invalid_request_error',
      code,
      message,
    );
  }

  static async fromResponse(
    provider: ProviderKind,
    res: Response,
  ): Promise<UpstreamError> {
    const upstreamMessage = await readErrorMessage(res);
    const { status } = res;

    if (status === 401 || status === 403) {
      return new UpstreamError(
        provider,
        true,
        502,
        'upstream_auth_failed',
        `Upstream ${provider} rejected the gateway's credentials`,
      );
    }
    if (status === 429) {
      return new UpstreamError(
        provider,
        true,
        429,
        'upstream_rate_limited',
        `Upstream ${provider} is rate limiting: ${upstreamMessage}`,
      );
    }
    if (status === 408 || status >= 500) {
      return new UpstreamError(
        provider,
        true,
        502,
        'upstream_error',
        `Upstream ${provider} failed with ${status}: ${upstreamMessage}`,
      );
    }
    return new UpstreamError(
      provider,
      false,
      status,
      'upstream_invalid_request',
      upstreamMessage,
    );
  }

  static timeout(provider: ProviderKind, ms: number): UpstreamError {
    return new UpstreamError(
      provider,
      true,
      504,
      'upstream_timeout',
      `Upstream ${provider} did not respond within ${ms}ms`,
    );
  }

  static network(provider: ProviderKind, cause: unknown): UpstreamError {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return new UpstreamError(
      provider,
      true,
      502,
      'upstream_unreachable',
      `Could not reach upstream ${provider}: ${detail}`,
    );
  }
}

/** An error body that never finishes must not hold the request open. */
export const ERROR_BODY_TIMEOUT_MS = 5_000;

async function readErrorMessage(res: Response): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const text = await Promise.race([
    res.text().catch(() => ''),
    new Promise<string>((resolve) => {
      timer = setTimeout(() => {
        void res.body?.cancel().catch(() => undefined);
        resolve('');
      }, ERROR_BODY_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));

  try {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'error' in parsed &&
      typeof parsed.error === 'object' &&
      parsed.error !== null &&
      'message' in parsed.error &&
      typeof parsed.error.message === 'string'
    ) {
      return parsed.error.message;
    }
  } catch {
    // Non-JSON upstream body; fall through to raw text.
  }
  return text.slice(0, 500) || res.statusText;
}
