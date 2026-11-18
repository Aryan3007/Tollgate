import { Router } from 'express';
import type { AnalyticsController } from './analytics.controller.js';

/**
 * @openapi
 * /v1/admin/analytics/spend:
 *   get:
 *     tags: ["Admin: analytics"]
 *     summary: Spend report for a month
 *     description: >-
 *       Totals, a zero-filled daily series, the top 10 teams and models by spend, and a straight-line month-end
 *       projection. Months are UTC, matching how budgets reset. Built from the request log, so it lags live traffic
 *       by about a second.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: month
 *         in: query
 *         required: false
 *         schema: { type: string, pattern: '^\d{4}-(0[1-9]|1[0-2])$', example: '2026-10' }
 *         description: YYYY-MM; defaults to the current month
 *     responses:
 *       200:
 *         description: Spend report
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SpendReport' }
 *     x-errors:
 *       400: month is not YYYY-MM
 *       401: Missing or invalid admin token
 */
export function analyticsRoutes(controller: AnalyticsController): Router {
  const router = Router();
  router.get('/spend', (req, res) => controller.spend(req, res));
  return router;
}
