import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

export const spendQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM')
    .optional(),
});
export type SpendQuery = z.output<typeof spendQuery>;

// Documentation-only classes for Swagger. All money is in micro-rupees (₹1 = 1,000,000).

export class SpendTotalsDto {
  @ApiProperty({ example: 1284 })
  requests: number;

  @ApiProperty({ example: 37, description: 'Requests with status 400 or above' })
  errors: number;

  @ApiProperty({ example: 310, description: 'Requests answered from the cache' })
  cacheHits: number;

  @ApiProperty({ example: 18200000, description: 'What those cache hits would have cost, in micro-rupees' })
  savedMicroInr: number;

  @ApiProperty({ example: 512340 })
  inputTokens: number;

  @ApiProperty({ example: 98012 })
  outputTokens: number;

  @ApiProperty({ example: 63450210 })
  costMicroInr: number;
}

export class DailySpendDto {
  @ApiProperty({ example: '2026-10-28', description: 'UTC day' })
  date: string;

  @ApiProperty({ example: 212 })
  requests: number;

  @ApiProperty({ example: 9120400 })
  costMicroInr: number;
}

export class SpendByTeamDto {
  @ApiProperty({ format: 'uuid', example: '0b8f7c1e-3f4a-4c2d-9a51-6e2f0d7b9c11' })
  teamId: string;

  @ApiProperty({ example: 'Customer Support' })
  teamName: string;

  @ApiProperty({ example: 902 })
  requests: number;

  @ApiProperty({ example: 41200000 })
  costMicroInr: number;

  @ApiProperty({ example: 5000000000 })
  budgetMicroInr: number;
}

export class SpendByModelDto {
  @ApiProperty({ example: 'gpt-4o-mini' })
  model: string;

  @ApiProperty({ example: 1100 })
  requests: number;

  @ApiProperty({ example: 21000000 })
  costMicroInr: number;
}

export class SpendReportDto {
  @ApiProperty({ example: '2026-10' })
  month: string;

  @ApiProperty({ type: SpendTotalsDto })
  totals: SpendTotalsDto;

  @ApiProperty({ example: 15000000000, description: 'Sum of every team’s monthly budget' })
  totalBudgetMicroInr: number;

  @ApiProperty({ example: 70250000, description: 'Average daily spend so far × days in the month' })
  projectedMicroInr: number;

  @ApiProperty({ type: [DailySpendDto], description: 'One entry per UTC day up to today, zero-filled' })
  daily: DailySpendDto[];

  @ApiProperty({ type: [SpendByTeamDto], description: 'Top 10 teams by spend' })
  byTeam: SpendByTeamDto[];

  @ApiProperty({ type: [SpendByModelDto], description: 'Top 10 models by spend' })
  byModel: SpendByModelDto[];
}
