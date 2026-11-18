import type { RequestHandler } from 'express';
import { UnauthorizedError } from '../../common/errors/gateway-error.js';
import type { KeyContextService } from '../keys/key-context.service.js';
import { bearerToken } from './bearer-token.js';

/** The single place gateway (virtual) keys are checked. */
export function requireVirtualKey(keyContexts: KeyContextService): RequestHandler {
  return async (req, _res, next) => {
    const secret = bearerToken(req);
    const key = secret ? await keyContexts.resolve(secret) : null;
    if (!key) {
      // One message for missing, unknown, revoked and expired keys, so the
      // response does not reveal which keys exist.
      throw new UnauthorizedError('invalid_api_key', 'Invalid API key');
    }

    req.virtualKey = key;
    keyContexts.touch(key);
    next();
  };
}
