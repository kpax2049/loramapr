import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { getOwnerIdFromRequest, OwnerContextRequest } from '../../common/owner-context';
import { StartSessionDto } from './dto/start-session.dto';
import { StopSessionDto } from './dto/stop-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsService } from './sessions.service';

type SessionsQuery = {
  deviceId?: string | string[];
};

@Controller('api/sessions')
@UseGuards(OwnerGuard)
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async list(@Req() request: OwnerContextRequest, @Query() query: SessionsQuery) {
    const ownerId = getOwnerIdFromRequest(request);
    const deviceId = getSingleValue(query.deviceId, 'deviceId');
    return this.sessionsService.list(deviceId ?? undefined, ownerId);
  }

  @Post('start')
  async start(@Req() request: OwnerContextRequest, @Body() dto: StartSessionDto) {
    const ownerId = getOwnerIdFromRequest(request);
    return this.sessionsService.start(dto, ownerId);
  }

  @Post('stop')
  async stop(@Req() request: OwnerContextRequest, @Body() dto: StopSessionDto) {
    const ownerId = getOwnerIdFromRequest(request);
    return this.sessionsService.stop(dto, ownerId);
  }

  @Patch(':id')
  async update(@Req() request: OwnerContextRequest, @Param('id') id: string, @Body() dto: UpdateSessionDto) {
    const ownerId = getOwnerIdFromRequest(request);
    return this.sessionsService.update(id, dto, ownerId);
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
