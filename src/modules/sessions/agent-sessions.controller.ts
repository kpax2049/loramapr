import { BadRequestException, Body, Controller, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { SessionsService } from './sessions.service';

type AgentStartSessionBody = {
  deviceUid?: string;
  name?: string;
};

type AgentStopSessionBody = {
  deviceUid?: string;
};

@Controller('api/agent/sessions')
@UseGuards(ApiKeyGuard)
@RequireApiKeyScope(ApiKeyScope.INGEST)
export class AgentSessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post('start')
  async start(@Body() body: AgentStartSessionBody) {
    const deviceUid = parseDeviceUid(body?.deviceUid);
    const session = await this.sessionsService.startForDeviceUid(deviceUid, body?.name);
    if (!session) {
      throw new NotFoundException('Device not found');
    }
    return session;
  }

  @Post('stop')
  async stop(@Body() body: AgentStopSessionBody) {
    const deviceUid = parseDeviceUid(body?.deviceUid);
    const result = await this.sessionsService.stopForDeviceUid(deviceUid);
    if (!result) {
      throw new NotFoundException('Device not found');
    }
    return result;
  }
}

function parseDeviceUid(value: string | undefined): string {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException('deviceUid is required');
  }
  return value.trim();
}
