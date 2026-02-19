import { BadRequestException, Body, Controller, NotFoundException, Post, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { logInfo, logWarn } from '../../common/logging/structured-logger';
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
      logWarn('webhook.ingest.rejected', {
        source: 'agent',
        deviceUid,
        action: 'start_session',
        reason: 'device_not_found'
      });
      throw new NotFoundException('Device not found');
    }
    logInfo('webhook.ingest.accepted', {
      source: 'agent',
      deviceUid,
      action: 'start_session',
      sessionId: session.id
    });
    return session;
  }

  @Post('stop')
  async stop(@Body() body: AgentStopSessionBody) {
    const deviceUid = parseDeviceUid(body?.deviceUid);
    const result = await this.sessionsService.stopForDeviceUid(deviceUid);
    if (!result) {
      logWarn('webhook.ingest.rejected', {
        source: 'agent',
        deviceUid,
        action: 'stop_session',
        reason: 'device_not_found'
      });
      throw new NotFoundException('Device not found');
    }
    logInfo('webhook.ingest.accepted', {
      source: 'agent',
      deviceUid,
      action: 'stop_session',
      sessionId: result.session?.id ?? null,
      stopped: result.stopped
    });
    return result;
  }
}

function parseDeviceUid(value: string | undefined): string {
  if (!value || typeof value !== 'string' || value.trim().length === 0) {
    throw new BadRequestException('deviceUid is required');
  }
  return value.trim();
}
