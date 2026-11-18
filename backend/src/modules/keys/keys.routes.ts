import { Router } from 'express';
import type { KeysController } from './keys.controller.js';

/**
 * @openapi
 * /v1/admin/keys:
 *   post:
 *     tags: ["Admin: virtual keys"]
 *     summary: Create a virtual key
 *     description: >-
 *       Issues a new `tg_live_…` key for a team. The full key is returned once in `secret` and only its HMAC is
 *       stored, so it cannot be shown again. Every model in `allowedModels` must be an enabled model.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateKey' }
 *     responses:
 *       201:
 *         description: Key created
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CreatedKey' }
 *     x-errors:
 *       400: Invalid body
 *       401: Missing or invalid admin token
 *       422: Team does not exist, or a model is unknown or disabled
 *       500: Unexpected error
 *   get:
 *     tags: ["Admin: virtual keys"]
 *     summary: List virtual keys
 *     description: >-
 *       Paginated keys across all teams, newest first by default. `status` is derived: revoked wins over expired.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - $ref: '#/components/parameters/Page'
 *       - $ref: '#/components/parameters/Limit'
 *       - name: sortBy
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [createdAt, name, lastUsedAt], default: createdAt }
 *         description: Field to sort by
 *       - $ref: '#/components/parameters/SortOrder'
 *       - name: teamId
 *         in: query
 *         required: false
 *         schema: { type: string, format: uuid }
 *         description: Only keys owned by this team
 *       - name: status
 *         in: query
 *         required: false
 *         schema: { type: string, enum: [active, revoked, expired] }
 *         description: Filter by derived status
 *       - name: search
 *         in: query
 *         required: false
 *         schema: { type: string, minLength: 1, maxLength: 100 }
 *         description: Partial match on key name or prefix
 *     responses:
 *       200:
 *         description: Page of keys
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/PaginatedKeys' }
 *     x-errors:
 *       400: Invalid query
 *       401: Missing or invalid admin token
 *       500: Unexpected error
 * /v1/admin/keys/{id}:
 *   get:
 *     tags: ["Admin: virtual keys"]
 *     summary: Get a virtual key
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Key ID
 *     responses:
 *       200:
 *         description: The key
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Key' }
 *     x-errors:
 *       400: id is not a UUID
 *       401: Missing or invalid admin token
 *       404: Key not found
 *   patch:
 *     tags: ["Admin: virtual keys"]
 *     summary: Update a virtual key
 *     description: >-
 *       Changes name, model scope, limits or expiry. Takes effect on the next request (the key cache is invalidated).
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Key ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/UpdateKey' }
 *     responses:
 *       200:
 *         description: Updated key
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Key' }
 *     x-errors:
 *       400: Invalid body or id
 *       401: Missing or invalid admin token
 *       404: Key not found
 *       409: Key is revoked
 *       422: A model is unknown or disabled
 * /v1/admin/keys/{id}/revoke:
 *   post:
 *     tags: ["Admin: virtual keys"]
 *     summary: Revoke a virtual key
 *     description: >-
 *       Permanently disables the key. The next request using it gets 401, on every gateway instance. Revoking an
 *       already revoked key is a no-op.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: Key ID
 *     responses:
 *       200:
 *         description: Revoked key
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Key' }
 *     x-errors:
 *       400: id is not a UUID
 *       401: Missing or invalid admin token
 *       404: Key not found
 */
export function keysRoutes(controller: KeysController): Router {
  const router = Router();
  router.post('/', (req, res) => controller.create(req, res));
  router.get('/', (req, res) => controller.list(req, res));
  router.get('/:id', (req, res) => controller.get(req, res));
  router.patch('/:id', (req, res) => controller.update(req, res));
  router.post('/:id/revoke', (req, res) => controller.revoke(req, res));
  return router;
}
