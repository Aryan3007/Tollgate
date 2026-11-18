import { createHash, randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { UnauthorizedError } from '../../common/errors/gateway-error.js';
import type { AdminPrincipal } from '../../common/http/authenticated-request.js';
import type { Env } from '../../config/env.schema.js';
import { AdminAuthRepository } from './admin-auth.repository.js';
import { TokenService, type AccessTokenPayload } from './token.service.js';

export interface Session {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  admin: AdminPrincipal;
  /** Set as an httpOnly cookie by the controller; never in the JSON body. */
  refreshToken: string;
  refreshExpiresAt: Date;
}

const DAY_MS = 86_400_000;

// Verifying against a real hash when the email is unknown keeps response
// time the same, so login cannot be used to discover admin emails.
const DUMMY_HASH = await argon2.hash(randomBytes(16).toString('hex'));

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const invalidCredentials = () =>
  new UnauthorizedError('invalid_credentials', 'Email or password is incorrect');
const invalidRefresh = () =>
  new UnauthorizedError('invalid_refresh_token', 'Session expired; sign in again');

export class AdminAuthService {
  constructor(
    private readonly env: Env,
    private readonly repo: AdminAuthRepository,
    private readonly tokens: TokenService,
  ) {}

  async login(email: string, password: string): Promise<Session> {
    const admin = await this.repo.findAdminByEmail(email.toLowerCase());
    const valid = await argon2.verify(admin?.passwordHash ?? DUMMY_HASH, password);
    if (!admin || !valid) throw invalidCredentials();

    const refresh = this.newRefreshToken();
    await this.repo.insertRefreshToken({
      adminId: admin.id,
      familyId: randomUUID(),
      tokenHash: sha256(refresh.token),
      expiresAt: refresh.expiresAt,
    });
    return this.session({ id: admin.id, email: admin.email }, refresh);
  }

  async refresh(presented: string | undefined): Promise<Session> {
    if (!presented) throw invalidRefresh();

    const refresh = this.newRefreshToken();
    const result = await this.repo.rotate(sha256(presented), {
      tokenHash: sha256(refresh.token),
      expiresAt: refresh.expiresAt,
    });
    if (result.outcome !== 'rotated') throw invalidRefresh();

    const admin = await this.repo.findAdminById(result.adminId);
    if (!admin) throw invalidRefresh();
    return this.session({ id: admin.id, email: admin.email }, refresh);
  }

  async logout(presented: string | undefined): Promise<void> {
    if (presented) await this.repo.revokeFamilyOf(sha256(presented));
  }

  private newRefreshToken() {
    return {
      token: randomBytes(32).toString('base64url'),
      expiresAt: new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * DAY_MS),
    };
  }

  private async session(
    admin: AdminPrincipal,
    refresh: { token: string; expiresAt: Date },
  ): Promise<Session> {
    const payload: AccessTokenPayload = { sub: admin.id, email: admin.email, role: 'admin' };
    return {
      accessToken: this.tokens.sign(payload),
      tokenType: 'Bearer',
      expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
      admin,
      refreshToken: refresh.token,
      refreshExpiresAt: refresh.expiresAt,
    };
  }
}
