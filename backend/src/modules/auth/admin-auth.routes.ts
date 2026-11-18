import { Router, type RequestHandler } from 'express';
import type { AdminAuthController } from './admin-auth.controller.js';

/**
 * @openapi
 * /v1/admin/auth/login:
 *   post:
 *     tags: ["Admin: auth"]
 *     summary: Sign in
 *     description: >-
 *       Returns a short-lived access token and sets the refresh token as an httpOnly `tg_refresh` cookie scoped to
 *       /v1/admin/auth. Rate limited per IP.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Login' }
 *     responses:
 *       200:
 *         description: Signed in
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Session' }
 *     x-errors:
 *       400: Invalid body
 *       401: Email or password is incorrect
 *       429: Too many attempts
 * /v1/admin/auth/refresh:
 *   post:
 *     tags: ["Admin: auth"]
 *     summary: Refresh the session
 *     description: >-
 *       Exchanges the refresh cookie for a new access token and a new refresh cookie (rotation). Reusing an old
 *       refresh token revokes every session from that sign-in.
 *     security: [{ refreshCookie: [] }]
 *     responses:
 *       200:
 *         description: New session
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Session' }
 *     x-errors:
 *       401: Missing, expired, revoked or reused refresh token
 *       429: Too many attempts
 * /v1/admin/auth/logout:
 *   post:
 *     tags: ["Admin: auth"]
 *     summary: Sign out
 *     description: Revokes the refresh token family and clears the cookie. Always succeeds.
 *     security: [{ refreshCookie: [] }]
 *     responses:
 *       204:
 *         description: Signed out
 * /v1/admin/auth/me:
 *   get:
 *     tags: ["Admin: auth"]
 *     summary: Current admin
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The signed-in admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Admin' }
 *     x-errors:
 *       401: Missing or invalid admin token
 */
export function adminAuthRoutes(controller: AdminAuthController, requireAdmin: RequestHandler): Router {
  const router = Router();
  router.post('/login', (req, res) => controller.login(req, res));
  router.post('/refresh', (req, res) => controller.refresh(req, res));
  router.post('/logout', (req, res) => controller.logout(req, res));
  router.get('/me', requireAdmin, (req, res) => controller.me(req, res));
  return router;
}
