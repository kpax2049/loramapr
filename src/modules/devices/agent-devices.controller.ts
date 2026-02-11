import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { DevicesService } from './devices.service';

@Controller('api/agent/devices')
@UseGuards(ApiKeyGuard)
@RequireApiKeyScope(ApiKeyScope.INGEST)
export class AgentDevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get(':deviceUid/latest-position')
  async getLatestPosition(@Param('deviceUid') deviceUid: string) {
    const latest = await this.devicesService.getLatestPositionByUid(deviceUid);
    if (!latest) {
      throw new NotFoundException('Device not found');
    }
    return {
      deviceUid,
      deviceId: latest.deviceId,
      capturedAt: latest.capturedAt ? latest.capturedAt.toISOString() : null,
      lat: latest.lat,
      lon: latest.lon
    };
  }

  @Get(':deviceUid/auto-session')
  async getAutoSession(@Param('deviceUid') deviceUid: string) {
    const config = await this.devicesService.getAgentAutoSessionConfigByUid(deviceUid);
    if (!config) {
      throw new NotFoundException('Device not found');
    }
    return config;
  }
}
