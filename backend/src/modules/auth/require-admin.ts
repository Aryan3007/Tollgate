import type { RequestHandler } from 'express';
import { ForbiddenError, UnauthorizedError } from '../../common/errors/gateway-error.js';
import { bearerToken } from './bearer-token.js';
import type { AccessTokenPayload, TokenService } from './token.service.js';

/** The single place admin access tokens are checked. */
export function requireAdmin(tokens: TokenService): RequestHandler {
  return (req, _res, next) => {
    const token = bearerToken(req);
    if (!token) throw new UnauthorizedError('missing_token', 'Missing bearer token');

    let payload: AccessTokenPayload;
    try {
      payload = tokens.verify(token);
    } catch {
      throw new UnauthorizedError('invalid_token', 'Access token is invalid or expired');
    }
    if (payload.role !== 'admin') {
      throw new ForbiddenError('insufficient_role', 'Admin access required');
    }

    req.admin = { id: payload.sub, email: payload.email };
    next();
  };
}
