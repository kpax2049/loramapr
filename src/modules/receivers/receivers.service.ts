import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type ReceiverSource = 'lorawan' | 'meshtastic';

type ReceiverQueryParams = {
  source: ReceiverSource | 'any';
  deviceId?: string;
  sessionId?: string;
  from?: Date;
  to?: Date;
};

@Injectable()
export class ReceiversService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: ReceiverQueryParams) {
    if (params.source === 'lorawan') {
      return this.listLorawan(params);
    }
    if (params.source === 'meshtastic') {
      return this.listMeshtastic(params);
    }

    const [lorawan, meshtastic] = await Promise.all([
      this.listLorawan(params),
      this.listMeshtastic(params)
    ]);
    return [...lorawan, ...meshtastic];
  }

  private async listLorawan(params: Omit<ReceiverQueryParams, 'source'>) {
    const measurementWhere = buildMeasurementWhere(params);
    const rows = await this.prisma.rxMetadata.groupBy({
      by: ['gatewayId'],
      where: {
        measurement: measurementWhere
      },
      _count: { _all: true },
      _max: { receivedAt: true }
    });

    return rows.map((row) => ({
      id: row.gatewayId,
      source: 'lorawan' as const,
      count: row._count._all,
      lastSeenAt: row._max.receivedAt ?? null
    }));
  }

  private async listMeshtastic(params: Omit<ReceiverQueryParams, 'source'>) {
    const where = buildMeasurementWhere(params);
    where.gatewayId = { not: null };

    const rows = await this.prisma.measurement.groupBy({
      by: ['gatewayId'],
      where,
      _count: { _all: true },
      _max: { capturedAt: true }
    });

    return rows.map((row) => ({
      id: row.gatewayId as string,
      source: 'meshtastic' as const,
      count: row._count._all,
      lastSeenAt: row._max.capturedAt ?? null
    }));
  }
}

function buildMeasurementWhere(params: {
  deviceId?: string;
  sessionId?: string;
  from?: Date;
  to?: Date;
}) {
  const where: Record<string, unknown> = {};
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
  return where;
}
