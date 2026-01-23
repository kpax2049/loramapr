import { Module } from '@nestjs/common';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, OwnerGuard]
})
export class DevicesModule {}
