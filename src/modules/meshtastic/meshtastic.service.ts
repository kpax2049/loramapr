import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class MeshtasticService {
  constructor(private readonly prisma: PrismaService) {}

  async ingestEvent(body: unknown, idempotencyKeyHeader?: string): Promise<void> {
    const deviceUid = getDeviceUid(body);
    const eventId = normalizeIdempotencyKey(idempotencyKeyHeader) ?? getEventId(body);

    try {
      await this.prisma.webhookEvent.create({
        data: {
          source: 'meshtastic',
          eventType: 'event',
          deviceUid,
          uplinkId: eventId,
          payload: body as Prisma.InputJsonValue
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return;
      }
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
      source: 'meshtastic'
    };
    if (params.deviceUid) {
      where.deviceUid = params.deviceUid;
    }
    if (params.processingError) {
      where.processingError = params.processingError;
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
        processingError: true,
        deviceUid: true,
        uplinkId: true
      }
    });
  }

  async getEventById(id: string) {
    return this.prisma.webhookEvent.findFirst({
      where: { id, source: 'meshtastic' },
      select: {
        id: true,
        payload: true,
        receivedAt: true,
        processedAt: true,
        deviceUid: true,
        uplinkId: true,
        processingError: true
      }
    });
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

function getDeviceUid(body: unknown): string {
  if (body && typeof body === 'object') {
    const record = body as Record<string, unknown>;
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

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
