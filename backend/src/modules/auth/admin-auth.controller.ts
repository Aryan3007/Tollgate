import type { CookieOptions, Request, Response } from 'express';
import { adminOf } from '../../common/http/authenticated-request.js';
import { parseBody } from '../../common/http/parse.js';
import type { Env } from '../../config/env.schema.js';
import { AdminAuthService, type Session } from './admin-auth.service.js';
import { loginSchema } from './dto/auth.schemas.js';

export const REFRESH_COOKIE = 'tg_refresh';
const COOKIE_PATH = '/v1/admin/auth';

type SessionBody = Omit<Session, 'refreshToken' | 'refreshExpiresAt'>;

export class AdminAuthController {
  constructor(
    private readonly env: Env,
    private readonly auth: AdminAuthService,
  ) {}

  async login(req: Request, res: Response): Promise<void> {
    const body = parseBody(loginSchema, req.body);
    res.json(this.respond(res, await this.auth.login(body.email, body.password)));
  }

  async refresh(req: Request, res: Response): Promise<void> {
    try {
      res.json(this.respond(res, await this.auth.refresh(this.cookie(req))));
    } catch (err) {
      res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
      throw err;
    }
  }

  async logout(req: Request, res: Response): Promise<void> {
    await this.auth.logout(this.cookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
    res.status(204).end();
  }

  me(req: Request, res: Response): void {
    res.json(adminOf(req));
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
