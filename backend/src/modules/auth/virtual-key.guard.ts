import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { UnauthorizedError } from '../../common/errors/gateway-error.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import { KeyContextService } from '../keys/key-context.service.js';
import { bearerToken } from './bearer-token.js';

/** The single place gateway (virtual) keys are checked. */
@Injectable()
export class VirtualKeyGuard implements CanActivate {
  constructor(private readonly keyContexts: KeyContextService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const secret = bearerToken(req);
    const key = secret ? await this.keyContexts.resolve(secret) : null;
    if (!key) {
      // One message for missing, unknown, revoked and expired keys, so the
      // response does not reveal which keys exist.
      throw new UnauthorizedError('invalid_api_key', 'Invalid API key');
    }

    req.virtualKey = key;
    this.keyContexts.touch(key);
    return true;
  }
}
