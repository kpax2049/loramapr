import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { StartSessionDto } from './dto/start-session.dto';
import { StopSessionDto } from './dto/stop-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { SessionsService } from './sessions.service';

type SessionsQuery = {
  deviceId?: string | string[];
};

type SessionWindowQuery = {
  cursor?: string | string[];
  windowMs?: string | string[];
  limit?: string | string[];
};

const DEFAULT_WINDOW_LIMIT = 2000;
const MAX_WINDOW_LIMIT = 5000;
const MIN_WINDOW_MS = 1000;
const MAX_WINDOW_MS = 3_600_000;

@Controller('api/sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Get()
  async list(@Query() query: SessionsQuery) {
    const deviceId = getSingleValue(query.deviceId, 'deviceId');
    return this.sessionsService.list(deviceId ?? undefined);
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
  async update(@Param('id') id: string, @Body() dto: UpdateSessionDto) {
    return this.sessionsService.update(id, dto);
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

    return this.sessionsService.getWindow({
      sessionId: id,
      cursor,
      windowMs,
      limit
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
