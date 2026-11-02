import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Paginated } from '../../common/pagination.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiErrors } from '../../common/swagger/error-responses.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import {
  listModelsQuery,
  PaginatedModelsDto,
  type ListModelsQuery,
} from './dto/model.dto.js';
import { ModelsService, type ModelView } from './models.service.js';

@ApiTags('Admin: models')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/models')
export class ModelsController {
  constructor(private readonly models: ModelsService) {}

  @Get()
  @ApiOperation({
    summary: 'List enabled models',
    description: 'Models that can be put in a key’s `allowedModels`, sorted by alias, with their prices.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number, 1-indexed' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 100, description: 'Items per page, max 100' })
  @ApiResponse({ status: 200, description: 'Page of models', type: PaginatedModelsDto })
  @ApiErrors({ 400: 'Invalid query', 401: 'Missing or invalid admin token' })
  list(
    @Query(new ZodValidationPipe(listModelsQuery)) query: ListModelsQuery,
  ): Promise<Paginated<ModelView>> {
    return this.models.list(query);
  }
}
