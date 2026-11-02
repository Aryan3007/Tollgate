import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PII_ENTITIES } from '../../pii/detectors/index.js';
import { UsageTotalsDto } from '../../request-logs/dto/request-log.dto.js';

// Documentation-only classes for Swagger. Runtime validation lives in
// team.schemas.ts.

export class CreateTeamDto {
  @ApiProperty({ minLength: 1, maxLength: 100, example: 'Customer Support', description: 'Unique team name' })
  name: string;

  @ApiProperty({
    minimum: 0,
    example: 5000000000,
    description: 'Monthly budget in micro-rupees (₹1 = 1,000,000). 5000000000 is ₹5,000.',
  })
  monthlyBudgetMicroInr: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100000, example: 600, default: 600, description: 'Requests per minute across the team' })
  rpmLimit?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100000000, example: 200000, default: 200000, description: 'Tokens per minute across the team' })
  tpmLimit?: number;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 200000,
    example: 1024,
    default: 1024,
    description: 'Output-token cap used to estimate cost when a request omits max_tokens',
  })
  defaultMaxTokens?: number;

  @ApiPropertyOptional({
    enum: PII_ENTITIES,
    isArray: true,
    example: ['aadhaar', 'pan', 'phone', 'card', 'email'],
    default: PII_ENTITIES,
    description: 'PII types masked before requests reach a provider. An empty list turns masking off.',
  })
  piiEntities?: string[];

  @ApiPropertyOptional({ default: true, description: 'Serve repeated prompts from the cache' })
  cacheEnabled?: boolean;

  @ApiPropertyOptional({
    minimum: 0,
    maximum: 2,
    default: 0,
    description: 'Highest temperature that may be cached. A request that omits temperature counts as 1 (the provider default).',
  })
  cacheMaxTemperature?: number;

  @ApiPropertyOptional({ minimum: 10, maximum: 2592000, default: 3600, description: 'How long a cached answer lives, in seconds' })
  cacheTtlSeconds?: number;
}

export class UpdateTeamDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100, example: 'Customer Support' })
  name?: string;

  @ApiPropertyOptional({ minimum: 0, example: 7500000000, description: 'Monthly budget in micro-rupees' })
  monthlyBudgetMicroInr?: number;

  @ApiPropertyOptional({ minimum: 1, example: 900 })
  rpmLimit?: number;

  @ApiPropertyOptional({ minimum: 1, example: 300000 })
  tpmLimit?: number;

  @ApiPropertyOptional({ minimum: 1, example: 2048 })
  defaultMaxTokens?: number;

  @ApiPropertyOptional({ enum: PII_ENTITIES, isArray: true, example: ['phone', 'email'] })
  piiEntities?: string[];

  @ApiPropertyOptional({ example: true })
  cacheEnabled?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 2, example: 0 })
  cacheMaxTemperature?: number;

  @ApiPropertyOptional({ minimum: 10, maximum: 2592000, example: 3600 })
  cacheTtlSeconds?: number;
}

export class TeamDto {
  @ApiProperty({ format: 'uuid', example: '0b8f7c1e-3f4a-4c2d-9a51-6e2f0d7b9c11' })
  id: string;

  @ApiProperty({ example: 'Customer Support' })
  name: string;

  @ApiProperty({ example: 5000000000, description: 'Micro-rupees' })
  monthlyBudgetMicroInr: number;

  @ApiProperty({ example: 600 })
  rpmLimit: number;

  @ApiProperty({ example: 200000 })
  tpmLimit: number;

  @ApiProperty({ example: 1024 })
  defaultMaxTokens: number;

  @ApiProperty({ enum: PII_ENTITIES, isArray: true, example: ['aadhaar', 'pan', 'phone', 'card', 'email'] })
  piiEntities: string[];

  @ApiProperty({ example: true })
  cacheEnabled: boolean;

  @ApiProperty({ example: 0 })
  cacheMaxTemperature: number;

  @ApiProperty({ example: 3600 })
  cacheTtlSeconds: number;

  @ApiProperty({ format: 'date-time', example: '2026-10-21T06:30:00.000Z' })
  createdAt: string;

  @ApiProperty({ format: 'date-time', example: '2026-10-27T11:02:45.000Z' })
  updatedAt: string;

  @ApiProperty({ type: UsageTotalsDto, description: 'Month-to-date (UTC) usage from the request log' })
  usage: UsageTotalsDto;
}

export class PaginatedTeamsDto {
  @ApiProperty({ type: [TeamDto] })
  data: TeamDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 3 })
  total: number;
}
