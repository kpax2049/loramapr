import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Put,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { getOwnerIdFromRequest, OwnerContextRequest } from '../../common/owner-context';
import {
  DeviceDetail,
  DeviceAgentDecision,
  DeviceLatestStatus,
  DeviceListItem,
  DeviceMutableSummary,
  DeviceSummary,
  DevicesService
} from './devices.service';

@Controller('api/devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @UseGuards(OwnerGuard)
  async list(
    @Req() request: OwnerContextRequest,
    @Query('includeArchived') includeArchivedParam?: string
  ): Promise<{ items: DeviceListItem[]; count: number }> {
    const ownerId = getOwnerIdFromRequest(request);
    const includeArchived = parseBooleanQuery(includeArchivedParam, false, 'includeArchived');
    const items = await this.devicesService.list(ownerId, includeArchived);
    return { items, count: items.length };
  }

  @Patch(':id')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async patchDevice(
    @Param('id') id: string,
    @Body() body: DevicePatchBody
  ): Promise<DeviceMutableResponse> {
    const payload = parsePatchBody(body);
    const device = await this.devicesService.updateMutableFields(id, payload);
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return formatMutableDevice(device);
  }

  @Delete(':id')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  @HttpCode(200)
  async deleteDevice(
    @Param('id') id: string,
    @Query('mode') modeParam?: string,
    @Headers('x-confirm-delete') confirmDelete?: string
  ): Promise<{ mode: 'archive' | 'delete'; device?: DeviceMutableResponse; deleted?: boolean }> {
    const mode = parseDeleteMode(modeParam);
    if (mode === 'archive') {
      const device = await this.devicesService.archiveDevice(id);
      if (!device) {
        throw new NotFoundException('Device not found');
      }
      return {
        mode,
        device: formatMutableDevice(device)
      };
    }

    if (confirmDelete !== DELETE_CONFIRMATION_VALUE) {
      throw new BadRequestException(
        `Missing or invalid X-Confirm-Delete header. Set X-Confirm-Delete: ${DELETE_CONFIRMATION_VALUE}`
      );
    }

    const deleted = await this.devicesService.deleteDeviceWithCascade(id);
    if (!deleted) {
      throw new NotFoundException('Device not found');
    }

    return {
      mode,
      deleted: true
    };
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

  @Get(':id')
  @UseGuards(OwnerGuard)
  async getById(
    @Req() request: OwnerContextRequest,
    @Param('id') id: string
  ): Promise<DeviceDetailResponse> {
    const ownerId = getOwnerIdFromRequest(request);
    const device = await this.devicesService.getById(id, ownerId);
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return formatDeviceDetail(device);
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

  @Get(':id/agent-decisions')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async getAgentDecisions(
    @Param('id') id: string,
    @Query('limit') limitParam?: string
  ): Promise<{ items: AgentDecisionResponse[]; count: number }> {
    const limit = parseLimit(limitParam);
    const decisions = await this.devicesService.listAgentDecisions(id, limit);
    if (!decisions) {
      throw new NotFoundException('Device not found');
    }
    const items = decisions.map(formatAgentDecision);
    return { items, count: items.length };
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

type AgentDecisionResponse = {
  id: string;
  deviceId: string;
  deviceUid: string;
  decision: string;
  reason: string | null;
  inside: boolean | null;
  distanceM: number | null;
  capturedAt: string | null;
  createdAt: string;
};

type DevicePatchBody = {
  deviceUid?: unknown;
  name?: unknown;
  notes?: unknown;
  isArchived?: unknown;
};

type DeviceMutableResponse = {
  id: string;
  deviceUid: string;
  name: string | null;
  notes: string | null;
  isArchived: boolean;
  lastSeenAt: string | null;
};

type DeviceDetailResponse = {
  id: string;
  deviceUid: string;
  name: string | null;
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
  latestMeasurement: {
    capturedAt: string;
    lat: number;
    lon: number;
    rssi: number | null;
    snr: number | null;
    gatewayId: string | null;
  } | null;
};

const DEFAULT_RADIUS_METERS = 20;
const DEFAULT_MIN_OUTSIDE_SECONDS = 30;
const DEFAULT_MIN_INSIDE_SECONDS = 120;
const DEFAULT_AGENT_DECISIONS_LIMIT = 200;
const MAX_AGENT_DECISIONS_LIMIT = 1000;
const MAX_DEVICE_NAME_LENGTH = 64;
const MAX_DEVICE_NOTES_LENGTH = 2000;
const DELETE_CONFIRMATION_VALUE = 'DELETE';

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

function parseLimit(value?: string): number {
  if (value === undefined) {
    return DEFAULT_AGENT_DECISIONS_LIMIT;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException('limit must be a positive integer');
  }
  return Math.min(parsed, MAX_AGENT_DECISIONS_LIMIT);
}

function parsePatchBody(body: DevicePatchBody): {
  name?: string;
  notes?: string;
  isArchived?: boolean;
} {
  const input = body ?? {};

  if (Object.prototype.hasOwnProperty.call(input, 'deviceUid')) {
    throw new BadRequestException('deviceUid is immutable');
  }

  const update: {
    name?: string;
    notes?: string;
    isArchived?: boolean;
  } = {};

  if (input.name !== undefined) {
    if (typeof input.name !== 'string') {
      throw new BadRequestException('name must be a string');
    }
    if (input.name.length > MAX_DEVICE_NAME_LENGTH) {
      throw new BadRequestException(`name must be at most ${MAX_DEVICE_NAME_LENGTH} characters`);
    }
    update.name = input.name;
  }

  if (input.notes !== undefined) {
    if (typeof input.notes !== 'string') {
      throw new BadRequestException('notes must be a string');
    }
    if (input.notes.length > MAX_DEVICE_NOTES_LENGTH) {
      throw new BadRequestException(`notes must be at most ${MAX_DEVICE_NOTES_LENGTH} characters`);
    }
    update.notes = input.notes;
  }

  if (input.isArchived !== undefined) {
    if (typeof input.isArchived !== 'boolean') {
      throw new BadRequestException('isArchived must be a boolean');
    }
    update.isArchived = input.isArchived;
  }

  if (Object.keys(update).length === 0) {
    throw new BadRequestException('At least one field must be provided: name, notes, isArchived');
  }

  return update;
}

function parseBooleanQuery(
  value: string | undefined,
  defaultValue: boolean,
  name: string
): boolean {
  if (value === undefined) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  throw new BadRequestException(`${name} must be a boolean`);
}

function parseDeleteMode(value?: string): 'archive' | 'delete' {
  if (value === undefined || value === 'archive') {
    return 'archive';
  }
  if (value === 'delete') {
    return 'delete';
  }
  throw new BadRequestException('mode must be one of: archive, delete');
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

function formatAgentDecision(decision: DeviceAgentDecision): AgentDecisionResponse {
  return {
    id: decision.id,
    deviceId: decision.deviceId,
    deviceUid: decision.deviceUid,
    decision: decision.decision,
    reason: decision.reason,
    inside: decision.inside,
    distanceM: decision.distanceM,
    capturedAt: decision.capturedAt ? decision.capturedAt.toISOString() : null,
    createdAt: decision.createdAt.toISOString()
  };
}

function formatMutableDevice(device: DeviceMutableSummary): DeviceMutableResponse {
  return {
    id: device.id,
    deviceUid: device.deviceUid,
    name: device.name,
    notes: device.notes,
    isArchived: device.isArchived,
    lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null
  };
}

function formatDeviceDetail(device: DeviceDetail): DeviceDetailResponse {
  return {
    id: device.id,
    deviceUid: device.deviceUid,
    name: device.name,
    notes: device.notes,
    isArchived: device.isArchived,
    createdAt: device.createdAt.toISOString(),
    updatedAt: device.updatedAt.toISOString(),
    lastSeenAt: device.lastSeenAt ? device.lastSeenAt.toISOString() : null,
    latestMeasurement: device.latestMeasurement
      ? {
          capturedAt: device.latestMeasurement.capturedAt.toISOString(),
          lat: device.latestMeasurement.lat,
          lon: device.latestMeasurement.lon,
          rssi: device.latestMeasurement.rssi,
          snr: device.latestMeasurement.snr,
          gatewayId: device.latestMeasurement.gatewayId
        }
      : null
  };
}
