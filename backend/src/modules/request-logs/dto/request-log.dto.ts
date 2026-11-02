import { ApiProperty } from '@nestjs/swagger';

// Documentation-only classes for Swagger.

export class UsageTotalsDto {
  @ApiProperty({ example: 1284, description: 'Requests this month (UTC)' })
  requests: number;

  @ApiProperty({ example: 512340 })
  inputTokens: number;

  @ApiProperty({ example: 98012 })
  outputTokens: number;

  @ApiProperty({ example: 63450210, description: 'Micro-rupees (₹1 = 1,000,000)' })
  costMicroInr: number;
}

export class RequestLogDto {
  @ApiProperty({ format: 'uuid', example: '9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f' })
  id: string;

  @ApiProperty({ example: '2f1c8a7e-6b5d-4c3b-9a8f-7e6d5c4b3a21', description: 'Matches the x-request-id response header' })
  requestId: string;

  @ApiProperty({ format: 'uuid', example: '0b8f7c1e-3f4a-4c2d-9a51-6e2f0d7b9c11' })
  teamId: string;

  @ApiProperty({ format: 'uuid', example: '5d2c9a3e-1b7f-4e8a-b0c4-2f6d8e1a9b37' })
  keyId: string;

  @ApiProperty({ type: String, nullable: true, example: 'support-bot-prod' })
  keyName: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'tg_live_a1B2' })
  keyPrefix: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Customer Support' })
  teamName: string | null;

  @ApiProperty({ example: 'gpt-4o-mini' })
  requestedModel: string;

  @ApiProperty({ type: String, nullable: true, enum: ['openai', 'anthropic', 'groq'], example: 'openai' })
  provider: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'gpt-4o-mini-2024-07-18' })
  servedModel: string | null;

  @ApiProperty({ example: true })
  streamed: boolean;

  @ApiProperty({ example: 200, description: '499 = the client disconnected mid-stream' })
  statusCode: number;

  @ApiProperty({ type: String, nullable: true, example: null })
  errorCode: string | null;

  @ApiProperty({ example: 13 })
  inputTokens: number;

  @ApiProperty({ example: 7 })
  outputTokens: number;

  @ApiProperty({ example: 541, description: 'Micro-rupees' })
  costMicroInr: number;

  @ApiProperty({ example: 812 })
  latencyMs: number;

  @ApiProperty({ type: Number, nullable: true, example: 304, description: 'Time to first byte from the provider' })
  ttfbMs: number | null;

  @ApiProperty({
    enum: ['miss', 'exact', 'semantic', 'skipped'],
    example: 'miss',
    description: 'exact/semantic = answered from the cache; miss = cacheable but not found; skipped = not eligible (PII masked, tools, temperature too high, or caching off)',
  })
  cacheStatus: string;

  @ApiProperty({ example: 0, description: 'Micro-rupees a cache hit saved; 0 for everything else' })
  savedMicroInr: number;

  @ApiProperty({ example: 0 })
  redactionCount: number;

  @ApiProperty({ example: 0 })
  failoverCount: number;

  @ApiProperty({ format: 'date-time', example: '2026-10-28T04:48:49.942Z' })
  createdAt: string;
}

export class PaginatedRequestLogsDto {
  @ApiProperty({ type: [RequestLogDto] })
  data: RequestLogDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  limit: number;

  @ApiProperty({ example: 1284 })
  total: number;
}
