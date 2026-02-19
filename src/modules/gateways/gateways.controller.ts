import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { GatewaysService } from './gateways.service';

type GatewaysQuery = {
  deviceId?: string | string[];
  sessionId?: string | string[];
  from?: string | string[];
  to?: string | string[];
  limit?: string | string[];
};

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

@Controller('api/gateways')
@UseGuards(ApiKeyGuard)
@RequireApiKeyScope(ApiKeyScope.QUERY)
export class GatewaysController {
  constructor(private readonly gatewaysService: GatewaysService) {}

  @Get()
  async list(@Query() query: GatewaysQuery) {
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
    const requestedLimit = parseLimit(getSingleValue(query.limit, 'limit'));
    const limit = Math.min(requestedLimit, MAX_LIMIT);

    const items = await this.gatewaysService.list({
      deviceId: deviceId ?? undefined,
      sessionId: sessionId ?? undefined,
      from,
      to,
      limit
    });
    return { items, count: items.length, limit };
  }

  @Get(':gatewayId/stats')
  async stats(@Param('gatewayId') gatewayId: string, @Query() query: GatewaysQuery) {
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

    return this.gatewaysService.stats({
      gatewayId,
      deviceId: deviceId ?? undefined,
      sessionId: sessionId ?? undefined,
      from,
      to
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
