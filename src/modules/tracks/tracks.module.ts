import { Module } from '@nestjs/common';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { TracksController } from './tracks.controller';
import { TracksService } from './tracks.service';

@Module({
  controllers: [TracksController],
  providers: [TracksService, OwnerGuard]
})
export class TracksModule {}
