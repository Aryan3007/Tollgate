import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../common/errors/gateway-error.js';
import type { AuthenticatedRequest } from '../../common/http/authenticated-request.js';
import type { AccessTokenPayload } from './admin-auth.service.js';
import { bearerToken } from './bearer-token.js';

/** The single place admin access tokens are checked. */
@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerToken(req);
    if (!token) {
      throw new UnauthorizedError('missing_token', 'Missing bearer token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedError('invalid_token', 'Access token is invalid or expired');
    }
    if (payload.role !== 'admin') {
      throw new ForbiddenError('insufficient_role', 'Admin access required');
    }

    req.admin = { id: payload.sub, email: payload.email };
    return true;
  }
}
