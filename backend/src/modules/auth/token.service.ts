import jwt from 'jsonwebtoken';
import type { Env } from '../../config/env.schema.js';

export interface AccessTokenPayload {
  sub: string;
  email: string;
  role: 'admin';
}

/** Signs and verifies the short-lived admin access tokens (HS256). */
export class TokenService {
  constructor(private readonly env: Env) {}

  sign(payload: AccessTokenPayload): string {
    return jwt.sign(payload, this.env.JWT_ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS,
    });
  }

  /** Throws if the token is malformed, tampered with or expired. */
  verify(token: string): AccessTokenPayload {
    // Pinning the algorithm stops "alg: none" and key-confusion tricks.
    return jwt.verify(token, this.env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as AccessTokenPayload;
  }
}
