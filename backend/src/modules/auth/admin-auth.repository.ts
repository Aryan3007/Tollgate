import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import { DB, type Database } from '../../db/database.module.js';
import {
  admins,
  refreshTokens,
  type Admin,
  type RefreshToken,
} from '../../db/schema/index.js';

export type RotationResult =
  | { outcome: 'rotated'; adminId: string }
  | { outcome: 'invalid' }
  | { outcome: 'reused' };

@Injectable()
export class AdminAuthRepository {
  constructor(@Inject(DB) private readonly db: Database) {}

  async findAdminByEmail(email: string): Promise<Admin | null> {
    const [admin] = await this.db
      .select()
      .from(admins)
      .where(eq(admins.email, email));
    return admin ?? null;
  }

  async findAdminById(id: string): Promise<Admin | null> {
    const [admin] = await this.db.select().from(admins).where(eq(admins.id, id));
    return admin ?? null;
  }

  async insertRefreshToken(
    token: Pick<RefreshToken, 'adminId' | 'familyId' | 'tokenHash' | 'expiresAt'>,
  ): Promise<void> {
    await this.db.insert(refreshTokens).values(token);
  }

  /**
   * Swaps the presented token for a new one in one transaction. Presenting a
   * token that was already rotated means it leaked (or raced), so the whole
   * login family is revoked.
   */
  async rotate(
    presentedHash: string,
    next: Pick<RefreshToken, 'tokenHash' | 'expiresAt'>,
  ): Promise<RotationResult> {
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, presentedHash))
        .for('update');

      if (!current) return { outcome: 'invalid' };

      const now = new Date();
      if (current.revokedAt) {
        await tx
          .update(refreshTokens)
          .set({ revokedAt: now })
          .where(
            and(
              eq(refreshTokens.familyId, current.familyId),
              isNull(refreshTokens.revokedAt),
            ),
          );
        return { outcome: 'reused' };
      }
      if (current.expiresAt <= now) return { outcome: 'invalid' };

      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(eq(refreshTokens.id, current.id));
      await tx.insert(refreshTokens).values({
        adminId: current.adminId,
        familyId: current.familyId,
        ...next,
      });
      return { outcome: 'rotated', adminId: current.adminId };
    });
  }

  async revokeFamilyOf(tokenHash: string): Promise<void> {
    const [token] = await this.db
      .select({ familyId: refreshTokens.familyId })
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash));
    if (!token) return;

    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(refreshTokens.familyId, token.familyId),
          isNull(refreshTokens.revokedAt),
        ),
      );
  }
}
