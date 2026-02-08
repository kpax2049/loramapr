import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MeshtasticService } from './meshtastic.service';

@Controller('api/meshtastic')
export class MeshtasticController {
  constructor(private readonly meshtasticService: MeshtasticService) {}

  @Post('event')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.INGEST)
  @HttpCode(200)
  async ingest(@Body() body: unknown): Promise<{ status: string }> {
    await this.meshtasticService.ingestEvent(body);
    return { status: 'ok' };
  }

  @Get('events')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async listEvents(
    @Query('deviceUid') deviceUid?: string,
    @Query('processingError') processingError?: string,
    @Query('processed') processed?: string,
    @Query('limit') limit?: string
  ) {
    const parsedLimit = parseLimit(limit);
    const items = await this.meshtasticService.listEvents({
      deviceUid: deviceUid || undefined,
      processingError: processingError || undefined,
      processed: parseOptionalBoolean(processed, 'processed'),
      limit: parsedLimit
    });
    return { items, count: items.length };
  }

  @Get('events/:id')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async getEvent(@Param('id') id: string) {
    const event = await this.meshtasticService.getEventById(id);
    if (!event) {
      throw new NotFoundException('Webhook event not found');
    }
    return event;
  }

  @Get('receivers')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async listReceivers(@Query() query: MeshtasticReceiversQuery) {
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

    const items = await this.meshtasticService.listReceivers({
      deviceId: deviceId ?? undefined,
      sessionId: sessionId ?? undefined,
      from,
      to
    });

    return { items, count: items.length };
  }
}

type MeshtasticReceiversQuery = {
  deviceId?: string | string[];
  sessionId?: string | string[];
  from?: string | string[];
  to?: string | string[];
};

function parseLimit(value?: string): number {
  if (!value) {
    return 50;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException('limit must be a positive integer');
  }
  return Math.min(parsed, 200);
}

function parseOptionalBoolean(value: string | undefined, name: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new BadRequestException(`${name} must be true or false`);
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
