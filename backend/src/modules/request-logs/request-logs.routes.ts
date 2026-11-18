import { Router } from 'express';
import type { RequestLogsController } from './request-logs.controller.js';

/**
 * @openapi
 * /v1/admin/requests:
 *   get:
 *     tags: ["Admin: requests"]
 *     summary: List logged gateway requests
 *     description: >-
 *       Every request that passed authentication, newest first: model, provider, tokens, cost in micro-rupees,
 *       latency and outcome. Logs are written asynchronously, so a request appears here about a second after it
 *       finishes.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - name: sortOrder
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [asc, desc], default: desc }
 *         description: By creation time
 *       - name: keyId
 *         in: query
 *         required: false
 *         schema: { type: string, format: uuid }
 *         description: Only requests made with this key
 *       - name: teamId
 *         in: query
 *         required: false
 *         schema: { type: string, format: uuid }
 *         description: Only requests from this team
 *       - name: outcome
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [success, error] }
 *         description: success = status below 400
 *     responses:
 *       200:
 *         description: Page of requests
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaginatedRequestLogs' }
 *     x-errors:
 *       400: Invalid query
 *       401: Missing or invalid admin token
 */
export function requestLogsRoutes(controller: RequestLogsController): Router {
  const router = Router();
  router.get('/', (req, res) => controller.list(req, res));
  return router;
}
