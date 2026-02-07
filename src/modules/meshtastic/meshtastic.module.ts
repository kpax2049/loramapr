import { Module } from '@nestjs/common';
import { MeshtasticController } from './meshtastic.controller';
import { MeshtasticService } from './meshtastic.service';

@Module({
  controllers: [MeshtasticController],
  providers: [MeshtasticService]
})
export class MeshtasticModule {}
