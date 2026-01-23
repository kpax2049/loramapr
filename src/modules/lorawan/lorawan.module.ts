import { Module } from '@nestjs/common';
import { LorawanWebhookGuard } from '../../common/guards/lorawan-webhook.guard';
import { LorawanController } from './lorawan.controller';
import { LorawanService } from './lorawan.service';

@Module({
  controllers: [LorawanController],
  providers: [LorawanService, LorawanWebhookGuard]
})
export class LorawanModule {}
