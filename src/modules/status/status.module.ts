import { Module } from '@nestjs/common';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { LorawanModule } from '../lorawan/lorawan.module';
import { RetentionModule } from '../retention/retention.module';
import { StatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  imports: [LorawanModule, RetentionModule],
  controllers: [StatusController],
  providers: [StatusService, ApiKeyGuard]
})
export class StatusModule {}
