import { Module } from '@nestjs/common';
import { GatewaysController } from './gateways.controller';
import { GatewaysService } from './gateways.service';

@Module({
  controllers: [GatewaysController],
  providers: [GatewaysService]
})
export class GatewaysModule {}
