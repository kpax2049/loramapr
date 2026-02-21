import { BadRequestException, Controller, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { decodeCursor, EventDetail, EventsListResponse, EventsService, EventsSource } from './events.service';

@UseGuards(ApiKeyGuard)
@RequireApiKeyScope(ApiKeyScope.QUERY)
@Controller('api/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Get()
  async list(
    @Query('source') sourceRaw?: string,
    @Query('deviceUid') deviceUidRaw?: string,
    @Query('portnum') portnumRaw?: string,
    @Query('since') sinceRaw?: string,
    @Query('until') untilRaw?: string,
    @Query('q') qRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursorRaw?: string
  ): Promise<EventsListResponse> {
    const source = parseSource(sourceRaw);
    const deviceUid = parseOptionalText(deviceUidRaw);
    const portnum = parseOptionalText(portnumRaw);
    const since = parseDate(sinceRaw, 'since');
    const until = parseDate(untilRaw, 'until');
    const q = parseOptionalText(qRaw);
    const limit = parseLimit(limitRaw);
    const cursor = parseCursor(cursorRaw);

    if (since && until && since > until) {
      throw new BadRequestException('since must be before or equal to until');
    }

    return this.eventsService.list({
      source,
      deviceUid,
      portnum,
      since,
      until,
      q,
      limit,
      cursor
    });
  }

  @Get(':id')
  async getById(@Param('id') id: string): Promise<EventDetail> {
    const event = await this.eventsService.getById(id);
    if (!event) {
      throw new NotFoundException('Event not found');
    }
    return event;
  }
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const ALLOWED_SOURCES: EventsSource[] = ['meshtastic', 'lorawan', 'agent', 'sim'];

function parseLimit(value?: string): number {
  if (!value) {
    return DEFAULT_LIMIT;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException('limit must be a positive integer');
  }
  return Math.min(parsed, MAX_LIMIT);
}

function parseDate(value: string | undefined, name: string): Date | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${name} must be a valid ISO timestamp`);
  }
  return parsed;
}

function parseCursor(value?: string) {
  if (!value) {
    return undefined;
  }
  const cursor = decodeCursor(value);
  if (!cursor) {
    throw new BadRequestException(
      'cursor must be formatted as <receivedAt ISO>|<id> (for example 2026-01-01T00:00:00.000Z|uuid)'
    );
  }
  return cursor;
}

function parseOptionalText(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseSource(value?: string): EventsSource | undefined {
  const normalized = parseOptionalText(value)?.toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (ALLOWED_SOURCES.includes(normalized as EventsSource)) {
    return normalized as EventsSource;
  }
  throw new BadRequestException(
    `source must be one of: ${ALLOWED_SOURCES.join(', ')}`
  );
}
