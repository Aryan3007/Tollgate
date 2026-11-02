import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UsageTotalsDto } from '../../request-logs/dto/request-log.dto.js';
import { KEY_STATUSES } from './key.schemas.js';

// Documentation-only classes for Swagger. Runtime validation lives in
// key.schemas.ts.

export class CreateKeyDto {
  @ApiProperty({ format: 'uuid', example: '0b8f7c1e-3f4a-4c2d-9a51-6e2f0d7b9c11', description: 'Team that owns the key and pays for its usage' })
  teamId: string;

  @ApiProperty({ minLength: 1, maxLength: 100, example: 'support-bot-prod', description: 'Human-readable label' })
  name: string;

  @ApiProperty({
    type: [String],
    minItems: 1,
    maxItems: 50,
    example: ['gpt-4o-mini', 'claude-haiku-4-5'],
    description: 'Model aliases this key may call. Each must be an enabled model.',
  })
  allowedModels: string[];

  @ApiPropertyOptional({ minimum: 1, maximum: 100000, example: 120, description: 'Requests per minute; defaults to the team limit' })
  rpmLimit?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100000000, example: 60000, description: 'Tokens per minute; defaults to the team limit' })
  tpmLimit?: number;

  @ApiPropertyOptional({ format: 'date-time', example: '2027-01-31T23:59:59Z', description: 'Expiry (must be in the future). Omit for no expiry.' })
  expiresAt?: string;
}

export class UpdateKeyDto {
  @ApiPropertyOptional({ minLength: 1, maxLength: 100, example: 'support-bot-prod' })
  name?: string;

  @ApiPropertyOptional({ type: [String], minItems: 1, maxItems: 50, example: ['gpt-4o-mini'] })
  allowedModels?: string[];

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, example: 120, description: 'null resets to the team limit' })
  rpmLimit?: number | null;

  @ApiPropertyOptional({ type: Number, nullable: true, minimum: 1, example: 60000, description: 'null resets to the team limit' })
  tpmLimit?: number | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true, example: '2027-01-31T23:59:59Z', description: 'null removes the expiry' })
  expiresAt?: string | null;
}

export class KeyDto {
  @ApiProperty({ format: 'uuid', example: '5d2c9a3e-1b7f-4e8a-b0c4-2f6d8e1a9b37' })
  id: string;

  @ApiProperty({ format: 'uuid', example: '0b8f7c1e-3f4a-4c2d-9a51-6e2f0d7b9c11' })
  teamId: string;

  @ApiProperty({ example: 'Customer Support' })
  teamName: string;

  @ApiProperty({ example: 'support-bot-prod' })
  name: string;

  @ApiProperty({ example: 'tg_live_a1B2', description: 'First 12 characters of the key, safe to display' })
  prefix: string;

  @ApiProperty({ type: [String], example: ['gpt-4o-mini'] })
  allowedModels: string[];

  @ApiProperty({ type: Number, nullable: true, example: 120, description: 'null means the team limit applies' })
  rpmLimit: number | null;

  @ApiProperty({ type: Number, nullable: true, example: null, description: 'null means the team limit applies' })
  tpmLimit: number | null;

  @ApiProperty({ enum: KEY_STATUSES, example: 'active' })
  status: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, example: null })
  expiresAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, example: null })
  revokedAt: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true, example: '2026-10-28T09:14:03.120Z' })
  lastUsedAt: string | null;

  @ApiProperty({ format: 'date-time', example: '2026-10-21T06:30:00.000Z' })
  createdAt: string;

  @ApiProperty({ type: UsageTotalsDto, description: 'Month-to-date (UTC) usage from the request log' })
  usage: UsageTotalsDto;
}

export class CreatedKeyDto {
  @ApiProperty({ type: KeyDto })
  key: KeyDto;

  @ApiProperty({ example: 'tg_live_a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6', description: 'Full key. Returned once; it cannot be retrieved later.' })
  secret: string;
}

export class PaginatedKeysDto {
  @ApiProperty({ type: [KeyDto] })
  data: KeyDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;
}
