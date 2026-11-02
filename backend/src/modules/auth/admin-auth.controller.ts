import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import type { AdminPrincipal } from '../../common/http/authenticated-request.js';
import { CurrentAdmin } from '../../common/http/principal.decorators.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiErrors } from '../../common/swagger/error-responses.js';
import { APP_CONFIG } from '../../config/config.module.js';
import type { Env } from '../../config/env.schema.js';
import { AdminAuthService, type Session } from './admin-auth.service.js';
import { AdminJwtGuard } from './admin-jwt.guard.js';
import { AdminDto, LoginDto, SessionDto } from './dto/auth.dto.js';
import { loginSchema, type LoginInput } from './dto/auth.schemas.js';

export const REFRESH_COOKIE = 'tg_refresh';
const COOKIE_PATH = '/v1/admin/auth';

type SessionBody = Omit<Session, 'refreshToken' | 'refreshExpiresAt'>;

@ApiTags('Admin: auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(
    @Inject(APP_CONFIG) private readonly env: Env,
    private readonly auth: AdminAuthService,
  ) {}

  @Post('login')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Sign in',
    description:
      'Returns a short-lived access token and sets the refresh token as an httpOnly `tg_refresh` cookie scoped to /v1/admin/auth. Rate limited per IP.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Signed in', type: SessionDto })
  @ApiErrors({
    400: 'Invalid body',
    401: 'Email or password is incorrect',
    429: 'Too many attempts',
  })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionBody> {
    return this.respond(res, await this.auth.login(body.email, body.password));
  }

  @Post('refresh')
  @HttpCode(200)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({
    summary: 'Refresh the session',
    description:
      'Exchanges the refresh cookie for a new access token and a new refresh cookie (rotation). Reusing an old refresh token revokes every session from that sign-in.',
  })
  @ApiResponse({ status: 200, description: 'New session', type: SessionDto })
  @ApiErrors({ 401: 'Missing, expired, revoked or reused refresh token', 429: 'Too many attempts' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionBody> {
    try {
      return this.respond(res, await this.auth.refresh(this.cookie(req)));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiCookieAuth(REFRESH_COOKIE)
  @ApiOperation({ summary: 'Sign out', description: 'Revokes the refresh token family and clears the cookie. Always succeeds.' })
  @ApiResponse({ status: 204, description: 'Signed out' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(this.cookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AdminJwtGuard)
  @ApiOperation({ summary: 'Current admin' })
  @ApiResponse({ status: 200, description: 'The signed-in admin', type: AdminDto })
  @ApiErrors({ 401: 'Missing or invalid admin token' })
  me(@CurrentAdmin() admin: AdminPrincipal): AdminPrincipal {
    return admin;
  }

  private respond(res: Response, session: Session): SessionBody {
    const { refreshToken, refreshExpiresAt, ...body } = session;
    res.cookie(REFRESH_COOKIE, refreshToken, {
      ...this.cookieOptions(),
      expires: refreshExpiresAt,
    });
    return body;
  }

  private cookie(req: Request): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' && value.length <= 128 ? value : undefined;
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE ?? this.env.NODE_ENV === 'production',
      // Strict + a path limited to the auth routes keeps the cookie off every
      // other request, which also blocks cross-site refresh attempts.
      sameSite: 'strict',
      path: COOKIE_PATH,
    };
  }
}
