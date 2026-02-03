import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { CoverageWorker } from './coverage.worker';
import { MeasurementsController } from './measurements.controller';
import { MeasurementsService } from './measurements.service';
import { StatsController } from './stats.controller';

@Module({
  controllers: [MeasurementsController, StatsController],
  providers: [MeasurementsService, CoverageWorker, ApiKeyGuard, OwnerGuard],
  exports: [MeasurementsService]
})
export class MeasurementsModule {}
