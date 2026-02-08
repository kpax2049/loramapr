import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { ReceiversService } from './receivers.service';

type ReceiversQuery = {
  source?: string | string[];
  deviceId?: string | string[];
  sessionId?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

@Controller('api/receivers')
@UseGuards(ApiKeyGuard)
@RequireApiKeyScope(ApiKeyScope.QUERY)
export class ReceiversController {
  constructor(private readonly receiversService: ReceiversService) {}

  @Get()
  async list(@Query() query: ReceiversQuery) {
    const source = parseSource(getSingleValue(query.source, 'source'));
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

    return this.receiversService.list({
      source,
      deviceId: deviceId ?? undefined,
      sessionId: sessionId ?? undefined,
      from,
      to
    });
  }
}

function parseSource(value?: string): 'lorawan' | 'meshtastic' | 'any' {
  if (!value || value === 'any') {
    return 'any';
  }
  if (value === 'lorawan' || value === 'meshtastic') {
    return value;
  }
  throw new BadRequestException('source must be lorawan, meshtastic, or any');
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
