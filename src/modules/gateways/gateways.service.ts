import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

type GatewayQueryParams = {
  deviceId?: string;
  sessionId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
};

@Injectable()
export class GatewaysService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: GatewayQueryParams) {
    const measurementWhere: Record<string, unknown> = {};
    if (params.deviceId) {
      measurementWhere.deviceId = params.deviceId;
    }
    if (params.sessionId) {
      measurementWhere.sessionId = params.sessionId;
    }
    if (params.from || params.to) {
      const capturedAt: Record<string, Date> = {};
      if (params.from) {
        capturedAt.gte = params.from;
      }
      if (params.to) {
        capturedAt.lte = params.to;
      }
      measurementWhere.capturedAt = capturedAt;
    }

    const rows = await this.prisma.rxMetadata.groupBy({
      by: ['gatewayId'],
      where: {
        measurement: measurementWhere
      },
      _count: { _all: true },
      _max: { receivedAt: true }
    });

    return rows
      .sort((left, right) => right._count._all - left._count._all)
      .slice(0, params.limit ?? rows.length)
      .map((row) => ({
      gatewayId: row.gatewayId,
      count: row._count._all,
      lastSeenAt: row._max.receivedAt ?? null
      }));
  }

  async stats(params: GatewayQueryParams & { gatewayId: string }) {
    const measurementWhere: Record<string, unknown> = {};
    if (params.deviceId) {
      measurementWhere.deviceId = params.deviceId;
    }
    if (params.sessionId) {
      measurementWhere.sessionId = params.sessionId;
    }
    if (params.from || params.to) {
      const capturedAt: Record<string, Date> = {};
      if (params.from) {
        capturedAt.gte = params.from;
      }
      if (params.to) {
        capturedAt.lte = params.to;
      }
      measurementWhere.capturedAt = capturedAt;
    }

    const aggregate = await this.prisma.rxMetadata.aggregate({
      where: {
        gatewayId: params.gatewayId,
        measurement: measurementWhere
      },
      _count: { _all: true },
      _min: { rssi: true, snr: true, receivedAt: true },
      _max: { rssi: true, snr: true, receivedAt: true },
      _avg: { rssi: true, snr: true }
    });

    return {
      gatewayId: params.gatewayId,
      count: aggregate._count._all,
      rssi: {
        min: aggregate._min.rssi ?? null,
        max: aggregate._max.rssi ?? null,
        avg: aggregate._avg.rssi ?? null
      },
      snr: {
        min: aggregate._min.snr ?? null,
        max: aggregate._max.snr ?? null,
        avg: aggregate._avg.snr ?? null
      },
      lastSeenAt: aggregate._max.receivedAt ?? null
    };
  }
}
