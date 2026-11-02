import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { uuidParam } from '../../common/pagination.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiErrors } from '../../common/swagger/error-responses.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import {
  CreatedKeyDto,
  CreateKeyDto,
  KeyDto,
  PaginatedKeysDto,
  UpdateKeyDto,
} from './dto/key.dto.js';
import {
  createKeySchema,
  KEY_STATUSES,
  listKeysQuery,
  updateKeySchema,
  type CreateKeyInput,
  type ListKeysQuery,
  type UpdateKeyInput,
} from './dto/key.schemas.js';
import { KeysService, type CreatedKey, type KeyWithUsage } from './keys.service.js';
import type { Paginated } from '../../common/pagination.js';

const idParam = new ZodValidationPipe(uuidParam);

@ApiTags('Admin: virtual keys')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/keys')
export class KeysController {
  constructor(private readonly keys: KeysService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a virtual key',
    description:
      'Issues a new `tg_live_…` key for a team. The full key is returned once in `secret` and only its HMAC is stored, so it cannot be shown again. ' +
      'Every model in `allowedModels` must be an enabled model.',
  })
  @ApiBody({ type: CreateKeyDto })
  @ApiResponse({ status: 201, description: 'Key created', type: CreatedKeyDto })
  @ApiErrors({
    400: 'Invalid body',
    401: 'Missing or invalid admin token',
    422: 'Team does not exist, or a model is unknown or disabled',
    500: 'Unexpected error',
  })
  create(
    @Body(new ZodValidationPipe(createKeySchema)) body: CreateKeyInput,
  ): Promise<CreatedKey> {
    return this.keys.create(body);
  }

  @Get()
  @ApiOperation({
    summary: 'List virtual keys',
    description:
      'Paginated keys across all teams, newest first by default. `status` is derived: revoked wins over expired.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number, 1-indexed' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Items per page, max 100' })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['createdAt', 'name', 'lastUsedAt'], description: 'Field to sort by' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: 'Sort direction' })
  @ApiQuery({ name: 'teamId', required: false, type: String, format: 'uuid', description: 'Only keys owned by this team' })
  @ApiQuery({ name: 'status', required: false, enum: KEY_STATUSES, description: 'Filter by derived status' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Partial match on key name or prefix' })
  @ApiResponse({ status: 200, description: 'Page of keys', type: PaginatedKeysDto })
  @ApiErrors({ 400: 'Invalid query', 401: 'Missing or invalid admin token', 500: 'Unexpected error' })
  list(
    @Query(new ZodValidationPipe(listKeysQuery)) query: ListKeysQuery,
  ): Promise<Paginated<KeyWithUsage>> {
    return this.keys.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a virtual key' })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Key ID' })
  @ApiResponse({ status: 200, description: 'The key', type: KeyDto })
  @ApiErrors({ 400: 'id is not a UUID', 401: 'Missing or invalid admin token', 404: 'Key not found' })
  get(@Param('id', idParam) id: string): Promise<KeyWithUsage> {
    return this.keys.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a virtual key',
    description:
      'Changes name, model scope, limits or expiry. Takes effect on the next request (the key cache is invalidated).',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Key ID' })
  @ApiBody({ type: UpdateKeyDto })
  @ApiResponse({ status: 200, description: 'Updated key', type: KeyDto })
  @ApiErrors({
    400: 'Invalid body or id',
    401: 'Missing or invalid admin token',
    404: 'Key not found',
    409: 'Key is revoked',
    422: 'A model is unknown or disabled',
  })
  update(
    @Param('id', idParam) id: string,
    @Body(new ZodValidationPipe(updateKeySchema)) body: UpdateKeyInput,
  ): Promise<KeyWithUsage> {
    return this.keys.update(id, body);
  }

  @Post(':id/revoke')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Revoke a virtual key',
    description:
      'Permanently disables the key. The next request using it gets 401, on every gateway instance. Revoking an already revoked key is a no-op.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Key ID' })
  @ApiResponse({ status: 200, description: 'Revoked key', type: KeyDto })
  @ApiErrors({ 400: 'id is not a UUID', 401: 'Missing or invalid admin token', 404: 'Key not found' })
  revoke(@Param('id', idParam) id: string): Promise<KeyWithUsage> {
    return this.keys.revoke(id);
  }
}
