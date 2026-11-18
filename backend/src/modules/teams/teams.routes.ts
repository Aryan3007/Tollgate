import { Router } from 'express';
import type { TeamsController } from './teams.controller.js';

/**
 * @openapi
 * /v1/admin/teams:
 *   post:
 *     tags: ["Admin: teams"]
 *     summary: Create a team
 *     description: A team owns virtual keys and has its own monthly budget, rate limits, PII masking and cache settings.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateTeam' }
 *     responses:
 *       201:
 *         description: Team created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Team' }
 *     x-errors:
 *       400: Invalid body
 *       401: Missing or invalid admin token
 *       409: Team name already taken
 *       500: Unexpected error
 *   get:
 *     tags: ["Admin: teams"]
 *     summary: List teams
 *     description: Paginated, newest first by default.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - name: sortBy
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [createdAt, name], default: createdAt }
 *         description: Field to sort by
 *       - $ref: '#/components/parameters/SortOrder'
 *       - name: search
 *         in: query
 *         required: false
 *         schema: { type: string, minLength: 1, maxLength: 100 }
 *         description: Partial match on team name
 *     responses:
 *       200:
 *         description: Page of teams
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaginatedTeams' }
 *     x-errors:
 *       400: Invalid query
 *       401: Missing or invalid admin token
 *       500: Unexpected error
 * /v1/admin/teams/{id}:
 *   get:
 *     tags: ["Admin: teams"]
 *     summary: Get a team
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Team ID
 *     responses:
 *       200:
 *         description: The team
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Team' }
 *     x-errors:
 *       400: id is not a UUID
 *       401: Missing or invalid admin token
 *       404: Team not found
 *   patch:
 *     tags: ["Admin: teams"]
 *     summary: Update a team
 *     description: New limits apply to all of the team’s keys on their next request.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Team ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateTeam' }
 *     responses:
 *       200:
 *         description: Updated team
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Team' }
 *     x-errors:
 *       400: Invalid body or id
 *       401: Missing or invalid admin token
 *       404: Team not found
 *       409: Team name already taken
 */
export function teamsRoutes(controller: TeamsController): Router {
  const router = Router();
  router.post('/', (req, res) => controller.create(req, res));
  router.get('/', (req, res) => controller.list(req, res));
  router.get('/:id', (req, res) => controller.get(req, res));
  router.patch('/:id', (req, res) => controller.update(req, res));
  return router;
}
