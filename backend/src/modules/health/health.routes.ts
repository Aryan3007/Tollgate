import { Router } from 'express';
import type { HealthController } from './health.controller.js';

/**
 * @openapi
 * /health:
 *   get:
 *     tags: ["Health"]
 *     summary: "Liveness: the process is up"
 *     responses:
 *       200:
 *         description: Alive
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Liveness' }
 * /ready:
 *   get:
 *     tags: ["Health"]
 *     summary: "Readiness: Postgres and Redis are reachable (503 otherwise)"
 *     responses:
 *       200:
 *         description: Ready
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Readiness' }
 *     x-errors:
 *       503: A dependency is unreachable
 */
export function healthRoutes(controller: HealthController): Router {
  const router = Router();
  router.get('/health', (req, res) => controller.health(req, res));
  router.get('/ready', (req, res) => controller.ready(req, res));
  return router;
}
