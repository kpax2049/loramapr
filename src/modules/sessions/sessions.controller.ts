import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { StartSessionDto } from './dto/start-session.dto';
import { StopSessionDto } from './dto/stop-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsService } from './sessions.service';

@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post('start')
  async start(@Body() dto: StartSessionDto) {
    return this.sessionsService.start(dto);
  }

  @Post('stop')
  async stop(@Body() dto: StopSessionDto) {
    return this.sessionsService.stop(dto);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.sessionsService.update(id, dto);
  }
}
