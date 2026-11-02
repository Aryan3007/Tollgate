import { Module } from '@nestjs/common';
import { RequestLogsModule } from '../request-logs/request-logs.module.js';
import { BudgetSweeper } from './budget-sweeper.js';
import { BudgetService } from './budget.service.js';

@Module({
  imports: [RequestLogsModule],
  providers: [BudgetService, BudgetSweeper],
  exports: [BudgetService],
})
export class BudgetModule {}
