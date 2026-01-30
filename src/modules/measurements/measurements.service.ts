import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MeasurementIngestDto } from './dto/measurement-ingest.dto';

export type MeasurementIngestResult = {
  inserted: number;
  deviceUid: string;
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

type PreparedMeasurement = MeasurementIngestDto & { capturedAtDate: Date };

@Injectable()
export class MeasurementsService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(measurements: MeasurementIngestDto[]): Promise<MeasurementIngestResult> {
    const deviceUid = measurements[0].deviceUid;
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const device = await tx.device.upsert({
        where: { deviceUid },
        update: { lastSeenAt: now },
        create: { deviceUid, lastSeenAt: now },
        select: { id: true }
      });

      const sessionIds = Array.from(
        new Set(
          measurements.map((measurement) => measurement.sessionId).filter((value) => Boolean(value))
        )
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

      const data = measurements.map((measurement) => ({
        deviceId: device.id,
        sessionId:
          measurement.sessionId && validSessionIds.has(measurement.sessionId)
            ? measurement.sessionId
            : null,
        capturedAt: new Date(measurement.capturedAt),
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
        payloadRaw: measurement.payloadRaw
      }));

      const result = await tx.measurement.createMany({ data });

      return {
        inserted: result.count,
        deviceUid,
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
}
