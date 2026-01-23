import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MeasurementsController } from './measurements.controller';
import { MeasurementsService } from './measurements.service';

@Module({
  controllers: [MeasurementsController],
  providers: [MeasurementsService, ApiKeyGuard],
  exports: [MeasurementsService]
})
export class MeasurementsModule {}
