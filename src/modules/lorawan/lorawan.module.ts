import { Module } from '@nestjs/common';
import { LorawanRateLimitGuard } from '../../common/guards/lorawan-rate-limit.guard';
import { LorawanWebhookGuard } from '../../common/guards/lorawan-webhook.guard';
import { MeasurementsModule } from '../measurements/measurements.module';
import { LorawanController } from './lorawan.controller';
import { LorawanService } from './lorawan.service';

@Module({
  imports: [MeasurementsModule],
  controllers: [LorawanController],
  providers: [LorawanService, LorawanWebhookGuard, LorawanRateLimitGuard]
})
export class LorawanModule {}
