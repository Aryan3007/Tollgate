import { Router } from 'express';
import type { ModelsController } from './models.controller.js';

/**
 * @openapi
 * /v1/admin/models:
 *   get:
 *     tags: ["Admin: models"]
 *     summary: List enabled models
 *     description: Models that can be put in a key’s `allowedModels`, sorted by alias, with their prices.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - name: limit
 *         in: query
 *         required: false
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 100, example: 100 }
 *         description: Items per page, max 100
 *     responses:
 *       200:
 *         description: Page of models
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaginatedModels' }
 *     x-errors:
 *       400: Invalid query
 *       401: Missing or invalid admin token
 */
export function modelsRoutes(controller: ModelsController): Router {
  const router = Router();
  router.get('/', (req, res) => controller.list(req, res));
  return router;
}
