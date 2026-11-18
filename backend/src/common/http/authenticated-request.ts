import type { Request } from 'express';
import { UnauthorizedError } from '../errors/gateway-error.js';
import type { KeyContext } from '../../modules/keys/key-context.js';

export interface AdminPrincipal {
  id: string;
  email: string;
}

declare global {
  // Express's own extension point for adding request properties.
  // oxlint-disable-next-line typescript/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAdmin. */
      admin?: AdminPrincipal;
      /** Set by requireVirtualKey. */
      virtualKey?: KeyContext;
    }
  }
}

/** The signed-in admin. Only call on routes behind requireAdmin. */
export function adminOf(req: Request): AdminPrincipal {
  if (!req.admin) throw new UnauthorizedError('missing_token', 'Missing bearer token');
  return req.admin;
}

/** The caller's key. Only call on routes behind requireVirtualKey. */
export function keyOf(req: Request): KeyContext {
  if (!req.virtualKey) throw new UnauthorizedError('invalid_api_key', 'Invalid API key');
  return req.virtualKey;
}
