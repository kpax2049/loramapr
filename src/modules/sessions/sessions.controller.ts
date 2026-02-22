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
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { StartSessionDto } from './dto/start-session.dto';
import { StopSessionDto } from './dto/stop-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsService } from './sessions.service';

type SessionsQuery = {
  deviceId?: string | string[];
  includeArchived?: string | string[];
};

type SessionDeleteQuery = {
  mode?: string | string[];
};

type SessionWindowQuery = {
  cursor?: string | string[];
  windowMs?: string | string[];
  limit?: string | string[];
  sample?: string | string[];
};

type SessionSignalSeriesQuery = {
  metric?: string | string[];
  source?: string | string[];
  sample?: string | string[];
};

const DEFAULT_WINDOW_LIMIT = 2000;
const MAX_WINDOW_LIMIT = 5000;
const MIN_WINDOW_MS = 1000;
const MAX_WINDOW_MS = 3_600_000;
const DEFAULT_SIGNAL_SERIES_SAMPLE = 1200;
const MAX_SIGNAL_SERIES_SAMPLE = 5000;
const DELETE_CONFIRMATION_VALUE = 'DELETE';

@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async list(@Query() query: SessionsQuery) {
    const deviceId = getSingleValue(query.deviceId, 'deviceId');
    const includeArchivedRaw = getSingleValue(query.includeArchived, 'includeArchived');
    const includeArchived = parseOptionalBoolean(includeArchivedRaw, 'includeArchived') ?? false;
    const items = await this.sessionsService.list(deviceId ?? undefined, includeArchived);
    return { items, count: items.length };
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    const session = await this.sessionsService.getById(id);
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    return session;
  }

  @Post('start')
  async start(@Body() dto: StartSessionDto) {
    return this.sessionsService.start(dto);
  }

  @Post('stop')
  async stop(@Body() dto: StopSessionDto) {
    return this.sessionsService.stop(dto);
  }

  @Patch(':id')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async update(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.sessionsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  @HttpCode(200)
  async remove(
    @Param('id') id: string,
    @Query() query: SessionDeleteQuery,
    @Headers('x-confirm-delete') confirmDelete?: string
  ): Promise<
    | { mode: 'archive'; archived: true }
    | { mode: 'delete'; deleted: true; detachedMeasurementsCount: number }
  > {
    const modeRaw = getSingleValue(query.mode, 'mode');
    const mode = parseDeleteMode(modeRaw);
    if (mode === 'archive') {
      const archived = await this.sessionsService.archive(id);
      if (!archived) {
        throw new NotFoundException('Session not found');
      }
      return { mode: 'archive', archived: true };
    }

    if (confirmDelete !== DELETE_CONFIRMATION_VALUE) {
      throw new BadRequestException(
        `Missing or invalid X-Confirm-Delete header. Set X-Confirm-Delete: ${DELETE_CONFIRMATION_VALUE}`
      );
    }

    const removed = await this.sessionsService.deleteWithDetachedMeasurements(id);
    if (!removed) {
      throw new NotFoundException('Session not found');
    }
    return {
      mode: 'delete',
      deleted: true,
      detachedMeasurementsCount: removed.detachedMeasurementsCount
    };
  }

  @Get(':id/timeline')
  async timeline(@Param('id') id: string) {
    return this.sessionsService.getTimeline(id);
  }

  @Get(':id/window')
  async window(@Param('id') id: string, @Query() query: SessionWindowQuery) {
    const cursorRaw = getSingleValue(query.cursor, 'cursor');
    if (!cursorRaw) {
      throw new BadRequestException('cursor is required');
    }
    const cursor = parseDate(cursorRaw, 'cursor');
    const windowMs = parseWindowMs(getSingleValue(query.windowMs, 'windowMs'));
    const requestedLimit = parseLimit(getSingleValue(query.limit, 'limit'));
    const limit = Math.min(requestedLimit, MAX_WINDOW_LIMIT);
    const sample = parseSample(getSingleValue(query.sample, 'sample'));

    return this.sessionsService.getWindow({
      sessionId: id,
      cursor,
      windowMs,
      limit,
      sample
    });
  }

  @Get(':id/overview')
  async overview(@Param('id') id: string, @Query('sample') sampleRaw?: string) {
    const sample = parseOverviewSample(sampleRaw);
    return this.sessionsService.getOverview(id, sample);
  }

  @Get(':id/stats')
  async stats(@Param('id') id: string) {
    return this.sessionsService.getStats(id);
  }

  @Get(':id/signal-series')
  async signalSeries(@Param('id') id: string, @Query() query: SessionSignalSeriesQuery) {
    const metric = parseSignalMetric(getSingleValue(query.metric, 'metric'));
    const source = parseSignalSource(getSingleValue(query.source, 'source'));
    const sample = parseSignalSeriesSample(getSingleValue(query.sample, 'sample'));
    return this.sessionsService.getSignalSeries({
      sessionId: id,
      metric,
      source,
      sample
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

function parseDate(value: string, name: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`Invalid ${name} timestamp`);
  }
  return parsed;
}

function parseWindowMs(value: string | undefined): number {
  if (!value) {
    throw new BadRequestException('windowMs is required');
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < MIN_WINDOW_MS || parsed > MAX_WINDOW_MS) {
    throw new BadRequestException(`windowMs must be ${MIN_WINDOW_MS}..${MAX_WINDOW_MS}`);
  }
  return parsed;
}

function parseLimit(value: string | undefined): number {
  if (!value) {
    return DEFAULT_WINDOW_LIMIT;
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

function parseOverviewSample(value: string | undefined): number {
  if (!value) {
    return 1000;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException('sample must be a positive integer');
  }
  return Math.min(parsed, 5000);
}

function parseSignalMetric(value: string | undefined): 'rssi' | 'snr' {
  if (!value) {
    throw new BadRequestException('metric is required');
  }
  if (value === 'rssi' || value === 'snr') {
    return value;
  }
  throw new BadRequestException('metric must be one of: rssi, snr');
}

function parseSignalSource(
  value: string | undefined
): 'auto' | 'meshtastic' | 'lorawan' | 'measurement' {
  if (!value) {
    return 'auto';
  }
  if (value === 'auto' || value === 'meshtastic' || value === 'lorawan' || value === 'measurement') {
    return value;
  }
  throw new BadRequestException('source must be one of: auto, meshtastic, lorawan, measurement');
}

function parseSignalSeriesSample(value: string | undefined): number {
  if (!value) {
    return DEFAULT_SIGNAL_SERIES_SAMPLE;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException('sample must be a positive integer');
  }
  return Math.min(parsed, MAX_SIGNAL_SERIES_SAMPLE);
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

function parseDeleteMode(value?: string): 'archive' | 'delete' {
  if (!value || value === 'archive') {
    return 'archive';
  }
  if (value === 'delete') {
    return 'delete';
  }
  throw new BadRequestException('mode must be one of: archive, delete');
}
