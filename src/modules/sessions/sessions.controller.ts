import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { StartSessionDto } from './dto/start-session.dto';
import { StopSessionDto } from './dto/stop-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsService } from './sessions.service';

type SessionsQuery = {
  deviceId?: string | string[];
};

@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async list(@Query() query: SessionsQuery) {
    const deviceId = getSingleValue(query.deviceId, 'deviceId');
    return this.sessionsService.list(deviceId ?? undefined);
  }

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

function getSingleValue(value: string | string[] | undefined, name: string): string | undefined {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return undefined;
    }
    if (value.length > 1) {
      throw new BadRequestException(`Multiple values provided for ${name}`);
    }
    return value[0];
  }
  return value;
}
