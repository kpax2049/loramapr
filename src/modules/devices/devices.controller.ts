import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { getOwnerIdFromRequest, OwnerContextRequest } from '../../common/owner-context';
import { DeviceLatestStatus, DeviceListItem, DeviceSummary, DevicesService } from './devices.service';

@Controller('api/devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @UseGuards(OwnerGuard)
  async list(
    @Req() request: OwnerContextRequest
  ): Promise<{ items: DeviceListItem[]; count: number }> {
    const ownerId = getOwnerIdFromRequest(request);
    const items = await this.devicesService.list(ownerId);
    return { items, count: items.length };
  }

  @Get(':id/latest')
  @UseGuards(OwnerGuard)
  async latest(
    @Req() request: OwnerContextRequest,
    @Param('id') id: string
  ): Promise<{
    latestMeasurementAt: string | null;
    latestWebhookReceivedAt: string | null;
    latestWebhookError: string | null;
    latestWebhookSource: string | null;
  }> {
    const ownerId = getOwnerIdFromRequest(request);
    const latest = await this.devicesService.getLatestStatus(id, ownerId);
    if (!latest) {
      throw new NotFoundException('Device not found');
    }
    return formatLatestResponse(latest);
  }

  @Get('by-uid/:deviceUid')
  @UseGuards(OwnerGuard)
  async getByUid(
    @Req() request: OwnerContextRequest,
    @Param('deviceUid') deviceUid: string
  ): Promise<DeviceSummary> {
    const ownerId = getOwnerIdFromRequest(request);
    const device = await this.devicesService.getByUid(deviceUid, ownerId);
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }

  @Get(':id/auto-session')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async getAutoSession(@Param('id') id: string): Promise<AutoSessionConfigResponse> {
    const config = await this.devicesService.getAutoSessionConfig(id);
    if (!config) {
      throw new NotFoundException('Device not found');
    }
    return formatAutoSessionConfig(config);
  }

  @Put(':id/auto-session')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async updateAutoSession(
    @Param('id') id: string,
    @Body() body: AutoSessionConfigBody
  ): Promise<AutoSessionConfigResponse> {
    const payload = parseAutoSessionBody(body);
    const config = await this.devicesService.upsertAutoSessionConfig(id, payload);
    if (!config) {
      throw new NotFoundException('Device not found');
    }
    return formatAutoSessionConfig(config);
  }
}

function formatLatestResponse(latest: DeviceLatestStatus) {
  return {
    latestMeasurementAt: latest.latestMeasurementAt ? latest.latestMeasurementAt.toISOString() : null,
    latestWebhookReceivedAt: latest.latestWebhookReceivedAt
      ? latest.latestWebhookReceivedAt.toISOString()
      : null,
    latestWebhookError: latest.latestWebhookError ?? null,
    latestWebhookSource: latest.latestWebhookSource ?? null
  };
}

type AutoSessionConfigBody = {
  enabled?: boolean;
  homeLat?: number | null;
  homeLon?: number | null;
  radiusMeters?: number | null;
  minOutsideSeconds?: number | null;
  minInsideSeconds?: number | null;
};

type AutoSessionConfigResponse = {
  deviceId: string;
  enabled: boolean;
  homeLat: number | null;
  homeLon: number | null;
  radiusMeters: number;
  minOutsideSeconds: number;
  minInsideSeconds: number;
  updatedAt: string | null;
};

const DEFAULT_RADIUS_METERS = 20;
const DEFAULT_MIN_OUTSIDE_SECONDS = 30;
const DEFAULT_MIN_INSIDE_SECONDS = 120;

function parseAutoSessionBody(body: AutoSessionConfigBody) {
  if (typeof body?.enabled !== 'boolean') {
    throw new BadRequestException('enabled must be a boolean');
  }

  const homeLat = parseOptionalNumber(body.homeLat, 'homeLat');
  const homeLon = parseOptionalNumber(body.homeLon, 'homeLon');
  if (body.enabled && (homeLat === null || homeLon === null)) {
    throw new BadRequestException('homeLat and homeLon are required when enabled');
  }

  const radiusMeters = parseOptionalInt(body.radiusMeters, 'radiusMeters') ?? DEFAULT_RADIUS_METERS;
  const minOutsideSeconds =
    parseOptionalInt(body.minOutsideSeconds, 'minOutsideSeconds') ?? DEFAULT_MIN_OUTSIDE_SECONDS;
  const minInsideSeconds =
    parseOptionalInt(body.minInsideSeconds, 'minInsideSeconds') ?? DEFAULT_MIN_INSIDE_SECONDS;

  return {
    enabled: body.enabled,
    homeLat,
    homeLon,
    radiusMeters,
    minOutsideSeconds,
    minInsideSeconds
  };
}

function parseOptionalNumber(value: number | null | undefined, name: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${name} must be a number`);
  }
  return value;
}

function parseOptionalInt(value: number | null | undefined, name: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${name} must be a number`);
  }
  return Math.trunc(value);
}

function formatAutoSessionConfig(config: {
  deviceId: string;
  enabled: boolean;
  homeLat: number | null;
  homeLon: number | null;
  radiusMeters: number | null;
  minOutsideSeconds: number | null;
  minInsideSeconds: number | null;
  updatedAt: Date | null;
}): AutoSessionConfigResponse {
  return {
    deviceId: config.deviceId,
    enabled: config.enabled,
    homeLat: config.homeLat,
    homeLon: config.homeLon,
    radiusMeters: config.radiusMeters ?? DEFAULT_RADIUS_METERS,
    minOutsideSeconds: config.minOutsideSeconds ?? DEFAULT_MIN_OUTSIDE_SECONDS,
    minInsideSeconds: config.minInsideSeconds ?? DEFAULT_MIN_INSIDE_SECONDS,
    updatedAt: config.updatedAt ? config.updatedAt.toISOString() : null
  };
}
