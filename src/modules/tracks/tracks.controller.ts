import { BadRequestException, Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { getOwnerIdFromRequest, OwnerContextRequest } from '../../common/owner-context';
import { TrackResult, TracksService } from './tracks.service';

type TracksQuery = {
  deviceId?: string | string[];
  sessionId?: string | string[];
  from?: string | string[];
  to?: string | string[];
  bbox?: string | string[];
  limit?: string | string[];
  sample?: string | string[];
  gatewayId?: string | string[];
  receiverId?: string | string[];
  rxGatewayId?: string | string[];
};

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

@Controller('api/tracks')
export class TracksController {
  constructor(private readonly tracksService: TracksService) {}

  @Get()
  @UseGuards(OwnerGuard)
  async getTrack(
    @Req() request: OwnerContextRequest,
    @Query() query: TracksQuery
  ): Promise<TrackResult> {
    const ownerId = getOwnerIdFromRequest(request);
    const deviceId = getSingleValue(query.deviceId, 'deviceId');
    const sessionId = getSingleValue(query.sessionId, 'sessionId');

    if (!deviceId && !sessionId) {
      throw new BadRequestException('deviceId or sessionId is required');
    }
    if (deviceId && sessionId) {
      throw new BadRequestException('Provide either deviceId or sessionId, not both');
    }

    const from = parseDate(getSingleValue(query.from, 'from'), 'from');
    const to = parseDate(getSingleValue(query.to, 'to'), 'to');
    if (from && to && from > to) {
      throw new BadRequestException('from must be before to');
    }

    const bboxValue = getSingleValue(query.bbox, 'bbox');
    const bbox = bboxValue ? parseBbox(bboxValue) : undefined;

    const gatewayId = getSingleValue(query.gatewayId, 'gatewayId');
    const receiverId = getSingleValue(query.receiverId, 'receiverId');
    if (receiverId && gatewayId && receiverId !== gatewayId) {
      throw new BadRequestException('receiverId and gatewayId must match when both are provided');
    }
    const effectiveGatewayId = receiverId ?? gatewayId;
    const rxGatewayId = getSingleValue(query.rxGatewayId, 'rxGatewayId');

    const requestedLimit = parseLimit(getSingleValue(query.limit, 'limit'));
    const limit = Math.min(requestedLimit, MAX_LIMIT);
    const sample = parseSample(getSingleValue(query.sample, 'sample'));

    return this.tracksService.getTrack({
      deviceId: deviceId ?? undefined,
      sessionId: sessionId ?? undefined,
      from,
      to,
      bbox,
      limit,
      sample,
      gatewayId: effectiveGatewayId ?? undefined,
      rxGatewayId: rxGatewayId ?? undefined,
      ownerId
    });
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

function parseDate(value: string | undefined, name: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${name} timestamp`);
  }
  return parsed;
}

function parseLimit(value: string | undefined): number {
  if (!value) {
    return DEFAULT_LIMIT;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException('limit must be a positive integer');
  }
  return parsed;
}

function parseSample(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException('sample must be a positive integer');
  }
  return parsed;
}

function parseBbox(value: string): { minLon: number; minLat: number; maxLon: number; maxLat: number } {
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length !== 4) {
    throw new BadRequestException('bbox must be minLon,minLat,maxLon,maxLat');
  }

  const numbers = parts.map((part) => Number(part));
  if (numbers.some((part) => Number.isNaN(part))) {
    throw new BadRequestException('bbox must contain valid numbers');
  }

  const [minLon, minLat, maxLon, maxLat] = numbers;
  if (minLon > maxLon || minLat > maxLat) {
    throw new BadRequestException('bbox min values must be <= max values');
  }

  return { minLon, minLat, maxLon, maxLat };
}
