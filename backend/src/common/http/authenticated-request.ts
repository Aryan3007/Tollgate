import type { Request } from 'express';
import type { KeyContext } from '../../modules/keys/key-context.js';

export interface AdminPrincipal {
  id: string;
  email: string;
}

/** Populated by the guards; handlers read these through param decorators. */
export interface AuthenticatedRequest extends Request {
  admin?: AdminPrincipal;
  virtualKey?: KeyContext;
}
