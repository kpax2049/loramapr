import { Module } from '@nestjs/common';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { AgentDecisionsController } from './agent-decisions.controller';
import { AgentDevicesController } from './agent-devices.controller';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';

@Module({
  controllers: [DevicesController, AgentDevicesController, AgentDecisionsController],
  providers: [DevicesService, OwnerGuard]
})
export class DevicesModule {}
