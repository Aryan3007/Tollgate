import { Module } from '@nestjs/common';
import { RequestLogWriter } from './request-log.writer.js';
import { RequestLogsController } from './request-logs.controller.js';
import { RequestLogsRepository } from './request-logs.repository.js';

@Module({
  controllers: [RequestLogsController],
  providers: [RequestLogsRepository, RequestLogWriter],
  exports: [RequestLogsRepository, RequestLogWriter],
})
export class RequestLogsModule {}
