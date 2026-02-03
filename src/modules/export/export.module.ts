import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';

@Module({
  controllers: [ExportController]
})
export class ExportModule {}
