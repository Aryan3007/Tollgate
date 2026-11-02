import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { KeyContext } from '../../modules/keys/key-context.js';
import type {
  AdminPrincipal,
  AuthenticatedRequest,
} from './authenticated-request.js';

/** The admin set by AdminJwtGuard. Only use on guarded routes. */
export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminPrincipal =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().admin!,
);

/** The key context set by VirtualKeyGuard. Only use on guarded routes. */
export const CurrentKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): KeyContext =>
    ctx.switchToHttp().getRequest<AuthenticatedRequest>().virtualKey!,
);
