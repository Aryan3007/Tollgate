import { Router } from 'express';
import type { ProviderHealthController } from './provider-health.controller.js';

/**
 * @openapi
 * /v1/admin/providers:
 *   get:
 *     tags: ["Admin: providers"]
 *     summary: Provider health
 *     description: Circuit breaker state, whether a key is configured, and the last 15 minutes of traffic per provider.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: One entry per provider
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { $ref: '#/components/schemas/ProviderHealth' }
 *     x-errors:
 *       401: Missing or invalid admin token
 */
export function providerHealthRoutes(controller: ProviderHealthController): Router {
  const router = Router();
  router.get('/', (req, res) => controller.list(req, res));
  return router;
}
