import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiErrors } from '../../common/swagger/error-responses.js';
import { AdminJwtGuard } from '../auth/admin-jwt.guard.js';
import { AnalyticsService, type SpendReport } from './analytics.service.js';
import { SpendReportDto, spendQuery, type SpendQuery } from './dto/spend.dto.js';

@ApiTags('Admin: analytics')
@ApiBearerAuth()
@UseGuards(AdminJwtGuard)
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('spend')
  @ApiOperation({
    summary: 'Spend report for a month',
    description:
      'Totals, a zero-filled daily series, the top 10 teams and models by spend, and a straight-line month-end projection. ' +
      'Months are UTC, matching how budgets reset. Built from the request log, so it lags live traffic by about a second.',
  })
  @ApiQuery({ name: 'month', required: false, type: String, example: '2026-10', description: 'YYYY-MM; defaults to the current month' })
  @ApiResponse({ status: 200, description: 'Spend report', type: SpendReportDto })
  @ApiErrors({ 400: 'month is not YYYY-MM', 401: 'Missing or invalid admin token' })
  spend(@Query(new ZodValidationPipe(spendQuery)) query: SpendQuery): Promise<SpendReport> {
    return this.analytics.spend(query.month);
  }
}
