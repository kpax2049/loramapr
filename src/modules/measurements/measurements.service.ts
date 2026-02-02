import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MeasurementIngestDto } from './dto/measurement-ingest.dto';

export type MeasurementIngestResult = {
  inserted: number;
  deviceUid: string;
  deviceId: string;
};

export type CanonicalMeasurementInput = {
  capturedAt: string | Date;
  lat: number;
  lon: number;
  alt?: number;
  hdop?: number;
  rssi?: number;
  snr?: number;
  sf?: number;
  bw?: number;
  freq?: number;
  gatewayId?: string;
  payloadRaw?: string | Record<string, unknown>;
  sessionId?: string;
};

export type CanonicalIngestResult = {
  inserted: number;
  deviceId: string;
};

export type MeasurementQueryParams = {
  deviceId?: string;
  sessionId?: string;
  from?: Date;
  to?: Date;
  bbox?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  limit: number;
  ownerId?: string;
};

export type MeasurementQueryResult = {
  count: number;
  limit: number;
  items: Array<{
    id: string;
    deviceId: string;
    sessionId: string | null;
    capturedAt: Date;
    lat: number;
    lon: number;
    alt: number | null;
    rssi: number | null;
    snr: number | null;
    sf: number | null;
    bw: number | null;
    freq: number | null;
    gatewayId: string | null;
  }>;
};

export type MeasurementStatsParams = {
  deviceId?: string;
  sessionId?: string;
  from?: Date;
  to?: Date;
  ownerId?: string;
};

export type MeasurementStatsResult = {
  count: number;
  minCapturedAt: Date | null;
  maxCapturedAt: Date | null;
  gatewayCount: number;
};

type PreparedMeasurement = MeasurementIngestDto & { capturedAtDate: Date };

@Injectable()
export class MeasurementsService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(measurements: MeasurementIngestDto[]): Promise<MeasurementIngestResult> {
    const deviceUid = measurements[0].deviceUid;
    const now = new Date();

    const result = await this.ingestCanonical(
      deviceUid,
      measurements.map((measurement) => ({
        capturedAt: measurement.capturedAt,
        lat: measurement.lat,
        lon: measurement.lon,
        alt: measurement.alt,
        hdop: measurement.hdop,
        rssi: measurement.rssi,
        snr: measurement.snr,
        sf: measurement.sf,
        bw: measurement.bw,
        freq: measurement.freq,
        gatewayId: measurement.gatewayId,
        payloadRaw: measurement.payloadRaw,
        sessionId: measurement.sessionId
      })),
      now
    );

    return {
      inserted: result.inserted,
      deviceUid,
      deviceId: result.deviceId
    };
  }

  async ingestCanonical(
    deviceUid: string,
    items: CanonicalMeasurementInput[],
    timestamp: Date = new Date()
  ): Promise<CanonicalIngestResult> {
    return this.prisma.$transaction(async (tx) => {
      const device = await tx.device.upsert({
        where: { deviceUid },
        update: { lastSeenAt: timestamp },
        create: { deviceUid, lastSeenAt: timestamp },
        select: { id: true }
      });

      let fallbackSessionId: string | null = null;
      const hasAnySessionId = items.some((item) => Boolean(item.sessionId));
      if (!hasAnySessionId) {
        const activeSession = await tx.session.findFirst({
          where: {
            deviceId: device.id,
            endedAt: null
          },
          orderBy: { startedAt: 'desc' },
          select: { id: true }
        });
        fallbackSessionId = activeSession?.id ?? null;
      }

      const sessionIds = Array.from(
        new Set(items.map((item) => item.sessionId).filter((value) => Boolean(value)))
      ) as string[];

      const validSessionIds = new Set<string>();
      if (sessionIds.length > 0) {
        const sessions = await tx.session.findMany({
          where: { id: { in: sessionIds } },
          select: { id: true }
        });
        for (const session of sessions) {
          validSessionIds.add(session.id);
        }
      }

      const data = items.map((item) => ({
        deviceId: device.id,
        sessionId:
          item.sessionId && validSessionIds.has(item.sessionId)
            ? item.sessionId
            : fallbackSessionId,
        capturedAt: item.capturedAt instanceof Date ? item.capturedAt : new Date(item.capturedAt),
        lat: item.lat,
        lon: item.lon,
        alt: item.alt,
        hdop: item.hdop,
        rssi: item.rssi,
        snr: item.snr,
        sf: item.sf,
        bw: item.bw,
        freq: item.freq,
        gatewayId: item.gatewayId,
        payloadRaw:
          item.payloadRaw === undefined
            ? undefined
            : typeof item.payloadRaw === 'string'
            ? item.payloadRaw
            : JSON.stringify(item.payloadRaw)
      }));

      const result = await tx.measurement.createMany({ data });

      return {
        inserted: result.count,
        deviceId: device.id
      };
    });
  }

  async query(params: MeasurementQueryParams): Promise<MeasurementQueryResult> {
    const where: Record<string, unknown> = {};

    if (params.deviceId) {
      where.deviceId = params.deviceId;
    }
    if (params.sessionId) {
      where.sessionId = params.sessionId;
    }
    if (params.ownerId) {
      // TODO: confirm owner scoping logic (device owner vs session owner) once auth exists.
      where.device = { ownerId: params.ownerId };
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

    if (params.bbox) {
      where.lat = { gte: params.bbox.minLat, lte: params.bbox.maxLat };
      where.lon = { gte: params.bbox.minLon, lte: params.bbox.maxLon };
    }

    const items = await this.prisma.measurement.findMany({
      where,
      orderBy: { capturedAt: 'asc' },
      take: params.limit,
      select: {
        id: true,
        capturedAt: true,
        lat: true,
        lon: true,
        alt: true,
        rssi: true,
        snr: true,
        sf: true,
        bw: true,
        freq: true,
        gatewayId: true,
        deviceId: true,
        sessionId: true
      }
    });

    return {
      count: items.length,
      limit: params.limit,
      items
    };
  }

  async stats(params: MeasurementStatsParams): Promise<MeasurementStatsResult> {
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
    if (params.ownerId) {
      // TODO: confirm owner scoping logic once auth exists.
      where.device = { ownerId: params.ownerId };
    }

    const [aggregate, gatewayGroups] = await Promise.all([
      this.prisma.measurement.aggregate({
        where,
        _count: { _all: true },
        _min: { capturedAt: true },
        _max: { capturedAt: true }
      }),
      this.prisma.measurement.groupBy({
        by: ['gatewayId'],
        where: {
          ...where,
          gatewayId: { not: null }
        }
      })
    ]);

    return {
      count: aggregate._count._all,
      minCapturedAt: aggregate._min.capturedAt ?? null,
      maxCapturedAt: aggregate._max.capturedAt ?? null,
      gatewayCount: gatewayGroups.length
    };
  }
}
