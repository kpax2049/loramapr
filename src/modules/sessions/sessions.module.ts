import { Module } from '@nestjs/common';
import { AgentSessionsController } from './agent-sessions.controller';
import { SessionsController } from './sessions.controller';
import { SessionsService } from './sessions.service';

@Module({
  controllers: [SessionsController, AgentSessionsController],
  providers: [SessionsService]
})
export class SessionsModule {}
