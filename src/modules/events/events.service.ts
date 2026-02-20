import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, WebhookEventSource } from '@prisma/client';

export type EventsSource = 'meshtastic' | 'lorawan' | 'agent' | 'sim';

export type EventsCursor = {
  receivedAt: Date;
  id: string;
};

export type ListEventsParams = {
  source?: EventsSource;
  deviceUid?: string;
  portnum?: string;
  since?: Date;
  until?: Date;
  q?: string;
  limit: number;
  cursor?: EventsCursor;
};

export type EventListItem = {
  id: string;
  source: EventsSource;
  receivedAt: Date;
  deviceUid: string | null;
  portnum: string | null;
  packetId: string | null;
  rxRssi: number | null;
  rxSnr: number | null;
  hopLimit: number | null;
  relayNode: string | null;
  transportMechanism: string | null;
  lat: number | null;
  lon: number | null;
  time: string | null;
};

export type EventDetail = {
  id: string;
  source: EventsSource;
  receivedAt: Date;
  processedAt: Date | null;
  deviceUid: string | null;
  portnum: string | null;
  packetId: string | null;
  eventType: string | null;
  error: string | null;
  payloadJson: Prisma.JsonValue;
};

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ListEventsParams): Promise<{
    items: EventListItem[];
    nextCursor?: string;
  }> {
    const where = buildWhereClause(params);
    const rows = await this.prisma.webhookEvent.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: params.limit + 1,
      select: {
        id: true,
        source: true,
        receivedAt: true,
        deviceUid: true,
        portnum: true,
        packetId: true,
        payloadJson: true
      }
    });

    const hasMore = rows.length > params.limit;
    const sliced = hasMore ? rows.slice(0, params.limit) : rows;
    const items = sliced.map((row) => formatListItem(row));

    if (!hasMore || items.length === 0) {
      return { items };
    }

    const last = items[items.length - 1];
    return {
      items,
      nextCursor: encodeCursor({
        receivedAt: last.receivedAt,
        id: last.id
      })
    };
  }

  async getById(id: string): Promise<EventDetail | null> {
    const row = await this.prisma.webhookEvent.findUnique({
      where: { id },
      select: {
        id: true,
        source: true,
        receivedAt: true,
        processedAt: true,
        deviceUid: true,
        portnum: true,
        packetId: true,
        eventType: true,
        error: true,
        payloadJson: true
      }
    });

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      source: normalizeSourceForApi(row.source),
      receivedAt: row.receivedAt,
      processedAt: row.processedAt,
      deviceUid: row.deviceUid,
      portnum: row.portnum,
      packetId: row.packetId,
      eventType: row.eventType,
      error: row.error,
      payloadJson: row.payloadJson
    };
  }
}

function buildWhereClause(params: ListEventsParams): Prisma.WebhookEventWhereInput | undefined {
  const and: Prisma.WebhookEventWhereInput[] = [];

  if (params.source) {
    and.push({ source: normalizeSourceForDb(params.source) });
  }
  if (params.deviceUid) {
    and.push({ deviceUid: params.deviceUid });
  }
  if (params.portnum) {
    and.push({ portnum: params.portnum });
  }
  if (params.since || params.until) {
    const receivedAt: Prisma.DateTimeFilter = {};
    if (params.since) {
      receivedAt.gte = params.since;
    }
    if (params.until) {
      receivedAt.lte = params.until;
    }
    and.push({ receivedAt });
  }
  if (params.q) {
    and.push({
      OR: [
        { deviceUid: { contains: params.q, mode: 'insensitive' } },
        { portnum: { contains: params.q, mode: 'insensitive' } },
        { packetId: { contains: params.q, mode: 'insensitive' } }
      ]
    });
  }
  if (params.cursor) {
    and.push({
      OR: [
        { receivedAt: { lt: params.cursor.receivedAt } },
        {
          AND: [{ receivedAt: params.cursor.receivedAt }, { id: { lt: params.cursor.id } }]
        }
      ]
    });
  }

  if (and.length === 0) {
    return undefined;
  }

  return { AND: and };
}

function formatListItem(row: {
  id: string;
  source: WebhookEventSource;
  receivedAt: Date;
  deviceUid: string | null;
  portnum: string | null;
  packetId: string | null;
  payloadJson: Prisma.JsonValue;
}): EventListItem {
  const payload = toRecord(row.payloadJson);
  const position = extractPositionSummary(payload);

  return {
    id: row.id,
    source: normalizeSourceForApi(row.source),
    receivedAt: row.receivedAt,
    deviceUid: row.deviceUid,
    portnum: row.portnum,
    packetId: row.packetId,
    rxRssi: extractNumber(payload, ['rxRssi', 'rx_rssi', 'rssi']),
    rxSnr: extractNumber(payload, ['rxSnr', 'rx_snr', 'snr']),
    hopLimit: extractInteger(payload, ['hopLimit', 'hop_limit']),
    relayNode: extractString(payload, ['relayNode', 'relay_node']),
    transportMechanism: extractString(payload, ['transportMechanism', 'transport_mechanism']),
    lat: position.lat,
    lon: position.lon,
    time: position.time
  };
}

function extractPositionSummary(payload: Record<string, unknown> | null): {
  lat: number | null;
  lon: number | null;
  time: string | null;
} {
  if (!payload) {
    return { lat: null, lon: null, time: null };
  }

  const candidates = collectCandidateRecords(payload);
  for (const candidate of candidates) {
    const lat = extractNumber(candidate, ['lat', 'latitude', 'latitudeI', 'latitude_i']);
    const lon = extractNumber(candidate, ['lon', 'longitude', 'longitudeI', 'longitude_i']);
    if (lat === null || lon === null) {
      continue;
    }

    const normalizedLat = normalizeCoordinate(lat, 90);
    const normalizedLon = normalizeCoordinate(lon, 180);
    if (normalizedLat === null || normalizedLon === null) {
      continue;
    }

    return {
      lat: normalizedLat,
      lon: normalizedLon,
      time: extractTimeIso(candidate)
    };
  }

  return { lat: null, lon: null, time: null };
}

function collectCandidateRecords(root: Record<string, unknown>): Record<string, unknown>[] {
  const stack: unknown[] = [root];
  const results: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }
    if (Array.isArray(current)) {
      for (const entry of current) {
        stack.push(entry);
      }
      continue;
    }

    const record = current as Record<string, unknown>;
    if (seen.has(record)) {
      continue;
    }
    seen.add(record);
    results.push(record);

    for (const value of Object.values(record)) {
      if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }

  return results;
}

function extractTimeIso(record: Record<string, unknown>): string | null {
  const isoLike = extractString(record, ['time', 'timestamp', 'receivedAt']);
  if (isoLike) {
    const maybeDate = new Date(isoLike);
    if (!Number.isNaN(maybeDate.getTime())) {
      return maybeDate.toISOString();
    }
  }

  const seconds = extractNumber(record, ['time', 'timestamp', 'rxTime', 'rx_time']);
  if (seconds !== null) {
    const millis = seconds >= 1_000_000_000_000 ? seconds : seconds * 1000;
    return new Date(millis).toISOString();
  }

  return null;
}

function extractNumber(
  payload: Record<string, unknown> | null,
  keys: string[]
): number | null {
  if (!payload) {
    return null;
  }

  for (const key of keys) {
    const direct = payload[key];
    const parsedDirect = toFiniteNumber(direct);
    if (parsedDirect !== null) {
      return parsedDirect;
    }

    const nested = payload.payload;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const value = (nested as Record<string, unknown>)[key];
      const parsedNested = toFiniteNumber(value);
      if (parsedNested !== null) {
        return parsedNested;
      }
    }

    const decoded = payload.decoded;
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      const value = (decoded as Record<string, unknown>)[key];
      const parsedDecoded = toFiniteNumber(value);
      if (parsedDecoded !== null) {
        return parsedDecoded;
      }
    }
  }

  return null;
}

function extractInteger(
  payload: Record<string, unknown> | null,
  keys: string[]
): number | null {
  const value = extractNumber(payload, keys);
  return value === null ? null : Math.trunc(value);
}

function extractString(
  payload: Record<string, unknown> | null,
  keys: string[]
): string | null {
  if (!payload) {
    return null;
  }

  for (const key of keys) {
    const value = payload[key];
    const parsed = toNonEmptyString(value);
    if (parsed) {
      return parsed;
    }

    const nested = payload.payload;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedParsed = toNonEmptyString((nested as Record<string, unknown>)[key]);
      if (nestedParsed) {
        return nestedParsed;
      }
    }

    const decoded = payload.decoded;
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      const decodedParsed = toNonEmptyString((decoded as Record<string, unknown>)[key]);
      if (decodedParsed) {
        return decodedParsed;
      }
    }
  }

  return null;
}

function toRecord(value: Prisma.JsonValue): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeCoordinate(value: number, limit: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const abs = Math.abs(value);
  if (abs > limit || (Number.isInteger(value) && abs >= 1_000_000)) {
    return value / 1e7;
  }
  return value;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function normalizeSourceForDb(source: EventsSource): WebhookEventSource {
  if (source === 'meshtastic') {
    return WebhookEventSource.MESHTASTIC;
  }
  if (source === 'agent') {
    return WebhookEventSource.AGENT;
  }
  if (source === 'sim') {
    return WebhookEventSource.SIM;
  }
  return WebhookEventSource.LORAWAN;
}

function normalizeSourceForApi(source: WebhookEventSource): EventsSource {
  if (source === WebhookEventSource.MESHTASTIC) {
    return 'meshtastic';
  }
  if (source === WebhookEventSource.AGENT) {
    return 'agent';
  }
  if (source === WebhookEventSource.SIM) {
    return 'sim';
  }
  return 'lorawan';
}

export function encodeCursor(cursor: EventsCursor): string {
  return `${cursor.receivedAt.toISOString()}|${cursor.id}`;
}

export function decodeCursor(raw: string): EventsCursor | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const separatorIndex = trimmed.indexOf('|');
  if (separatorIndex <= 0 || separatorIndex === trimmed.length - 1) {
    return null;
  }
  const receivedAtRaw = trimmed.slice(0, separatorIndex);
  const id = trimmed.slice(separatorIndex + 1);
  const receivedAt = new Date(receivedAtRaw);
  if (Number.isNaN(receivedAt.getTime()) || id.trim().length === 0) {
    return null;
  }
  return {
    receivedAt,
    id
  };
}
