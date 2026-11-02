import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Paginated } from '../../common/pagination.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiErrors } from '../../common/swagger/error-responses.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import { PaginatedRequestLogsDto } from './dto/request-log.dto.js';
import { listRequestsQuery, type ListRequestsQuery } from './dto/request-log.schemas.js';
import { RequestLogsRepository, type RequestLogView } from './request-logs.repository.js';

@ApiTags('Admin: requests')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/requests')
export class RequestLogsController {
  constructor(private readonly logs: RequestLogsRepository) {}

  @Get()
  @ApiOperation({
    summary: 'List logged gateway requests',
    description:
      'Every request that passed authentication, newest first: model, provider, tokens, cost in micro-rupees, latency and outcome. ' +
      'Logs are written asynchronously, so a request appears here about a second after it finishes.',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1, description: 'Page number, 1-indexed' })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, description: 'Items per page, max 100' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'], description: 'By creation time' })
  @ApiQuery({ name: 'keyId', required: false, type: String, format: 'uuid', description: 'Only requests made with this key' })
  @ApiQuery({ name: 'teamId', required: false, type: String, format: 'uuid', description: 'Only requests from this team' })
  @ApiQuery({ name: 'outcome', required: false, enum: ['success', 'error'], description: 'success = status below 400' })
  @ApiResponse({ status: 200, description: 'Page of requests', type: PaginatedRequestLogsDto })
  @ApiErrors({ 400: 'Invalid query', 401: 'Missing or invalid admin token' })
  list(@Query(new ZodValidationPipe(listRequestsQuery)) query: ListRequestsQuery): Promise<Paginated<RequestLogView>> {
    return this.logs.list(query);
  }
}
