import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const listModelsQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
export type ListModelsQuery = z.output<typeof listModelsQuery>;

export class CatalogModelDto {
  @ApiProperty({ example: 'gpt-4o-mini', description: 'Name clients send as `model`' })
  alias: string;

  @ApiProperty({ example: 'gpt-4o-mini', description: "Provider's own model name" })
  upstreamName: string;

  @ApiProperty({ enum: ['openai', 'anthropic', 'groq'], example: 'openai' })
  providerKind: string;

  @ApiProperty({ example: 0.15, description: 'USD per 1M input tokens' })
  inputUsdPerMtok: number;

  @ApiProperty({ example: 0.6, description: 'USD per 1M output tokens' })
  outputUsdPerMtok: number;

  @ApiProperty({ example: true })
  supportsJson: boolean;

  @ApiProperty({ example: true })
  supportsTools: boolean;
}

export class PaginatedModelsDto {
  @ApiProperty({ type: [CatalogModelDto] })
  data: CatalogModelDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 100 })
  limit: number;

  @ApiProperty({ example: 6 })
  total: number;
}
