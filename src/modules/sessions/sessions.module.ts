import { Module } from '@nestjs/common';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController],
  providers: [SessionsService, OwnerGuard]
})
export class SessionsModule {}
