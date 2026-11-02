import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ApiErrors } from '../../common/swagger/error-responses.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import { ProviderHealthService, type ProviderHealth } from './provider-health.service.js';

class HealthWindowDto {
  @ApiProperty({ example: 15 })
  minutes: number;

  @ApiProperty({ example: 212 })
  requests: number;

  @ApiProperty({ example: 3, description: 'Requests that ended with status 500 or above' })
  errors: number;

  @ApiProperty({ type: Number, nullable: true, example: 640 })
  p50Ms: number | null;

  @ApiProperty({ type: Number, nullable: true, example: 1820 })
  p95Ms: number | null;
}

class ProviderHealthDto {
  @ApiProperty({ enum: ['openai', 'anthropic', 'groq'], example: 'openai' })
  kind: string;

  @ApiProperty({ example: true })
  enabled: boolean;

  @ApiProperty({ example: true, description: 'A key for this provider is available' })
  configured: boolean;

  @ApiProperty({ enum: ['closed', 'open', 'half_open'], example: 'closed', description: 'closed is healthy' })
  breaker: string;

  @ApiProperty({ type: HealthWindowDto })
  window: HealthWindowDto;
}

@ApiTags('Admin: providers')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/providers')
export class ProviderHealthController {
  constructor(private readonly health: ProviderHealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Provider health',
    description: 'Circuit breaker state, whether a key is configured, and the last 15 minutes of traffic per provider.',
  })
  @ApiResponse({ status: 200, description: 'One entry per provider', type: [ProviderHealthDto] })
  @ApiErrors({ 401: 'Missing or invalid admin token' })
  list(): Promise<ProviderHealth[]> {
    return this.health.list();
  }
}
