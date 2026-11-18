import { join } from 'node:path';
import type { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import type { Env } from '../config/env.schema.js';
import { schemas } from './schemas.js';

const DESCRIPTION =
  'Self-hosted, OpenAI-compatible LLM gateway: budgets, PII redaction, semantic caching and provider failover. ' +
  'Gateway routes take a virtual key (`tg_live_…`); admin routes take an admin access token.';

const definition = {
  openapi: '3.0.0',
  info: { title: 'Tollgate', version: '1.0', description: DESCRIPTION },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Admin access token from /v1/admin/auth/login',
      },
      virtualKey: {
        type: 'http',
        scheme: 'bearer',
        description: 'Tollgate virtual key (tg_live_…)',
      },
      refreshCookie: { type: 'apiKey', in: 'cookie', name: 'tg_refresh' },
    },
    parameters: {
      Page: {
        name: 'page',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 10000, default: 1, example: 1 },
        description: 'Page number, 1-indexed',
      },
      Limit: {
        name: 'limit',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, maximum: 100, default: 20, example: 20 },
        description: 'Items per page, max 100',
      },
      SortOrder: {
        name: 'sortOrder',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        description: 'Sort direction',
      },
    },
    schemas,
  },
};

interface Operation {
  responses?: Record<string, unknown>;
  'x-errors'?: Record<string, string>;
}

/**
 * Route files list their error responses in a compact `x-errors` map
 * ({ status: description }). Every error has the same body, so this expands
 * each entry into a full response that references the shared error schema.
 */
function expandErrorShorthand(paths: Record<string, Record<string, Operation>>): void {
  for (const pathItem of Object.values(paths)) {
    for (const operation of Object.values(pathItem)) {
      const errors = operation['x-errors'];
      if (!errors) continue;
      operation.responses ??= {};
      for (const [status, description] of Object.entries(errors)) {
        operation.responses[status] = {
          description,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/OpenAIError' } } },
        };
      }
      delete operation['x-errors'];
    }
  }
}

export type OpenApiSpec = ReturnType<typeof swaggerJsdoc> & {
  paths: Record<string, Record<string, Operation>>;
};

/**
 * Builds the OpenAPI document from the `@openapi` JSDoc blocks in the route
 * files. They are found next to this module's parent folder, so the same code
 * works from src/ (tests, tsx) and from the compiled dist/.
 */
export function buildOpenApiSpec(): OpenApiSpec {
  const modulesDir = join(import.meta.dirname, '..', 'modules');
  const spec = swaggerJsdoc({
    definition,
    apis: [join(modulesDir, '**', '*.routes.{js,ts}')],
    failOnErrors: true,
  }) as OpenApiSpec;
  expandErrorShorthand(spec.paths);
  return spec;
}

/** Raw JSON is always served (the dashboard's swagger MCP reads it); the UI only when enabled. */
export function mountApiDocs(app: Express, env: Env, spec: OpenApiSpec): void {
  app.get('/api/docs-json', (_req, res) => {
    res.json(spec);
  });
  const uiEnabled = env.SWAGGER_UI_ENABLED ?? env.NODE_ENV !== 'production';
  if (uiEnabled) app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec));
}
