import { Injectable } from '@nestjs/common';
import { Prisma, WebhookEventSource } from '@prisma/client';
import { createHash } from 'crypto';
import { logError, logInfo } from '../../common/logging/structured-logger';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MeshtasticService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestEvent(body: unknown, idempotencyKeyHeader?: string): Promise<void> {
    // Store the incoming request payload as-is; normalization happens in the worker pipeline.
    const payloadJson = toPrismaJsonInput(body);
    const deviceUid = getDeviceUid(body);
    const eventId = normalizeIdempotencyKey(idempotencyKeyHeader) ?? getEventId(body);
    const portnum = getPortnum(body);

    try {
      await this.prisma.webhookEvent.create({
        data: {
          source: WebhookEventSource.MESHTASTIC,
          eventType: 'event',
          deviceUid,
          portnum,
          packetId: eventId,
          payloadJson
        }
      });
      logInfo('webhook.ingest.accepted', {
        source: 'meshtastic',
        deviceUid,
        packetId: eventId,
        portnum: portnum ?? null
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        logInfo('webhook.ingest.duplicate', {
          source: 'meshtastic',
          deviceUid,
          packetId: eventId
        });
        return;
      }
      logError('webhook.ingest.failed', {
        source: 'meshtastic',
        deviceUid,
        packetId: eventId,
        reason: getErrorMessage(error)
      });
      throw error;
    }
  }

  async listEvents(params: {
    deviceUid?: string;
    processingError?: string;
    processed?: boolean;
    limit: number;
    cursor?: Date;
  }) {
    const where: Record<string, unknown> = {
      source: WebhookEventSource.MESHTASTIC
    };
    if (params.deviceUid) {
      where.deviceUid = params.deviceUid;
    }
    if (params.processingError) {
      where.error = params.processingError;
    }
    if (params.processed !== undefined) {
      where.processedAt = params.processed ? { not: null } : null;
    }
    if (params.cursor) {
      where.receivedAt = { lt: params.cursor };
    }

    return this.prisma.webhookEvent.findMany({
      where,
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: params.limit,
      select: {
        id: true,
        receivedAt: true,
        processedAt: true,
        error: true,
        deviceUid: true,
        packetId: true
      }
    }).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        receivedAt: row.receivedAt,
        processedAt: row.processedAt,
        processingError: row.error,
        deviceUid: row.deviceUid,
        uplinkId: row.packetId
      }))
    );
  }

  async getEventById(id: string) {
    return this.prisma.webhookEvent.findFirst({
      where: { id, source: WebhookEventSource.MESHTASTIC },
      select: {
        id: true,
        payloadJson: true,
        receivedAt: true,
        processedAt: true,
        deviceUid: true,
        packetId: true,
        error: true
      }
    }).then((row) =>
      row
        ? {
            id: row.id,
            payload: row.payloadJson,
            receivedAt: row.receivedAt,
            processedAt: row.processedAt,
            deviceUid: row.deviceUid,
            uplinkId: row.packetId,
            processingError: row.error
          }
        : null
    );
  }

  async listReceivers(params: {
    deviceId?: string;
    sessionId?: string;
    from?: Date;
    to?: Date;
    limit: number;
  }) {
    const where: Record<string, unknown> = {
      gatewayId: { not: null }
    };
    if (params.deviceId) {
      where.deviceId = params.deviceId;
    }
    if (params.sessionId) {
      where.sessionId = params.sessionId;
    }
    if (params.from || params.to) {
      const capturedAt: Record<string, Date> = {};
      if (params.from) {
        capturedAt.gte = params.from;
      }
      if (params.to) {
        capturedAt.lte = params.to;
      }
      where.capturedAt = capturedAt;
    }

    const rows = await this.prisma.measurement.groupBy({
      by: ['gatewayId'],
      where,
      _count: { _all: true },
      _max: { capturedAt: true }
    });

    return rows
      .sort((left, right) => right._count._all - left._count._all)
      .slice(0, params.limit)
      .map((row) => ({
      receiverId: row.gatewayId as string,
      count: row._count._all,
      lastSeenAt: row._max.capturedAt ?? null
      }));
  }
}

function normalizeIdempotencyKey(value?: string): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toPrismaJsonInput(value: unknown): Prisma.InputJsonValue | Prisma.JsonNullValueInput {
  if (value === null) {
    return Prisma.JsonNull;
  }
  return value as Prisma.InputJsonValue;
}

function getDeviceUid(body: unknown): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    if (typeof record.fromId === 'number' && Number.isFinite(record.fromId)) {
      return String(record.fromId);
    }
    if (typeof record.fromId === 'string' && record.fromId.trim().length > 0) {
      return record.fromId;
    }
    if (typeof record.from === 'number' && Number.isFinite(record.from)) {
      return String(record.from);
    }
    if (typeof record.from === 'string' && record.from.trim().length > 0) {
      return record.from;
    }
    if (typeof record.nodeId === 'string' && record.nodeId.trim().length > 0) {
      return record.nodeId;
    }
    if (typeof record.nodeId === 'number' && Number.isFinite(record.nodeId)) {
      return String(record.nodeId);
    }
  }
  return 'unknown';
}

function getPortnum(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const record = body as Record<string, unknown>;
  const direct = toNonEmptyString(record.portnum);
  if (direct) {
    return direct;
  }

  const decoded = record.decoded;
  if (decoded && typeof decoded === 'object') {
    const nested = toNonEmptyString((decoded as Record<string, unknown>).portnum);
    if (nested) {
      return nested;
    }
  }

  const payload = record.payload;
  if (payload && typeof payload === 'object') {
    const payloadRecord = payload as Record<string, unknown>;
    const payloadDirect = toNonEmptyString(payloadRecord.portnum);
    if (payloadDirect) {
      return payloadDirect;
    }
    const payloadDecoded = payloadRecord.decoded;
    if (payloadDecoded && typeof payloadDecoded === 'object') {
      const nested = toNonEmptyString((payloadDecoded as Record<string, unknown>).portnum);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function getEventId(body: unknown): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
    const packetId = record.packetId;
    if (typeof packetId === 'string' && packetId.trim().length > 0) {
      return packetId;
    }
    if (typeof packetId === 'number' && Number.isFinite(packetId)) {
      return String(packetId);
    }
    const packetIdSnake = record.packet_id;
    if (typeof packetIdSnake === 'string' && packetIdSnake.trim().length > 0) {
      return packetIdSnake;
    }
    if (typeof packetIdSnake === 'number' && Number.isFinite(packetIdSnake)) {
      return String(packetIdSnake);
    }
    const id = record.id;
    if (typeof id === 'string' && id.trim().length > 0) {
      return id;
    }
    if (typeof id === 'number' && Number.isFinite(id)) {
      return String(id);
    }
  }

  const json = safeStringify(body);
  return createHash('sha256').update(json).digest('hex');
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return 'unstringifiable';
  }
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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
