import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
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
  sourceEventId?: string;
  source?: string;
  alt?: number;
  altitude?: number;
  hdop?: number;
  pdop?: number;
  satsInView?: number;
  precisionBits?: number;
  locationSource?: string;
  groundSpeed?: number;
  groundTrack?: number;
  rssi?: number;
  snr?: number;
  sf?: number;
  bw?: number;
  freq?: number;
  gatewayId?: string;
  payloadRaw?: string | Record<string, unknown>;
  rxMetadata?: Prisma.InputJsonValue | any[];
  sessionId?: string;
};

export type CanonicalIngestResult = {
  inserted: number;
  deviceId: string;
  measurementIds: string[];
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
  gatewayId?: string;
  rxGatewayId?: string;
  includeRx?: boolean;
  sample?: number;
  limit: number;
  ownerId?: string;
};

export type MeasurementQueryResult = {
  count: number;
  limit: number;
  totalBeforeSample: number;
  returnedAfterSample: number;
  items: Array<{
    id: string;
    deviceId: string;
    sessionId: string | null;
    sourceEventId: string | null;
    source: string | null;
    capturedAt: Date;
    lat: number;
    lon: number;
    alt: number | null;
    altitude: number | null;
    pdop: number | null;
    satsInView: number | null;
    precisionBits: number | null;
    locationSource: string | null;
    groundSpeed: number | null;
    groundTrack: number | null;
    rssi: number | null;
    snr: number | null;
    sf: number | null;
    bw: number | null;
    freq: number | null;
    gatewayId: string | null;
    rxMetadata: Prisma.JsonValue | null;
    meshtasticRx?: {
      rxRssi: number | null;
      rxSnr: number | null;
      hopLimit: number | null;
      relayNode: number | null;
      transportMechanism: string | null;
      rxTime: Date | null;
    } | null;
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
        rxMetadata: measurement.rxMetadata,
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

      const records = items.map((item) => {
        const id = randomUUID();
        const capturedAt = item.capturedAt instanceof Date ? item.capturedAt : new Date(item.capturedAt);
        const payloadRaw =
          item.payloadRaw === undefined
            ? undefined
            : typeof item.payloadRaw === 'string'
            ? item.payloadRaw
            : JSON.stringify(item.payloadRaw);
        const summaryFromRx = getSummaryFromRxMetadata(item.rxMetadata);
        const gatewayId =
          item.gatewayId ?? summaryFromRx?.gatewayId ?? undefined;
        const rssi =
          item.rssi ?? summaryFromRx?.rssi ?? undefined;
        const snr =
          item.snr ?? summaryFromRx?.snr ?? undefined;

        return {
          id,
          item,
          data: {
            id,
            deviceId: device.id,
            sessionId:
              item.sessionId && validSessionIds.has(item.sessionId)
                ? item.sessionId
                : fallbackSessionId,
            sourceEventId: item.sourceEventId,
            source: item.source,
            capturedAt,
            lat: item.lat,
            lon: item.lon,
            alt: item.alt,
            altitude: item.altitude,
            hdop: item.hdop,
            pdop: item.pdop,
            satsInView: item.satsInView,
            precisionBits: item.precisionBits,
            locationSource: item.locationSource,
            groundSpeed: item.groundSpeed,
            groundTrack: item.groundTrack,
            rssi,
            snr,
            sf: item.sf,
            bw: item.bw,
            freq: item.freq,
            gatewayId,
            payloadRaw,
            rxMetadata: item.rxMetadata ?? undefined
          }
        };
      });

      const result = await tx.measurement.createMany({ data: records.map((record) => record.data) });

      const rxRows: Prisma.RxMetadataCreateManyInput[] = [];
      const receivedAt = new Date();
      for (const record of records) {
        const rxMetadata = record.item.rxMetadata;
        if (!Array.isArray(rxMetadata)) {
          continue;
        }
        for (const entry of rxMetadata) {
          const gatewayId = entry && typeof entry === 'object' ? (entry as any)?.gateway_ids?.gateway_id : undefined;
          if (!gatewayId || typeof gatewayId !== 'string') {
            continue;
          }
          const rssiValue = (entry as any)?.rssi;
          const snrValue = (entry as any)?.snr;
          rxRows.push({
            measurementId: record.id,
            gatewayId,
            rssi: typeof rssiValue === 'number' && Number.isFinite(rssiValue) ? Math.round(rssiValue) : null,
            snr: typeof snrValue === 'number' && Number.isFinite(snrValue) ? snrValue : null,
            receivedAt
          });
        }
      }

      if (rxRows.length > 0) {
        await tx.rxMetadata.createMany({
          data: rxRows,
          skipDuplicates: true
        });
      }

      return {
        inserted: result.count,
        deviceId: device.id,
        measurementIds: records.map((record) => record.id)
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
    if (params.gatewayId) {
      where.gatewayId = params.gatewayId;
    }
    if (params.rxGatewayId) {
      where.rxMetadataRows = { some: { gatewayId: params.rxGatewayId } };
    }

    const baseSelect = {
      id: true,
      capturedAt: true,
      lat: true,
      lon: true,
      sourceEventId: true,
      source: true,
      alt: true,
      altitude: true,
      pdop: true,
      satsInView: true,
      precisionBits: true,
      locationSource: true,
      groundSpeed: true,
      groundTrack: true,
      rssi: true,
      snr: true,
      sf: true,
      bw: true,
      freq: true,
      gatewayId: true,
      rxMetadata: true,
      deviceId: true,
      sessionId: true
    } satisfies Prisma.MeasurementSelect;

    if (params.includeRx) {
      const items = await this.prisma.measurement.findMany({
        where,
        orderBy: { capturedAt: 'asc' },
        take: params.limit,
        select: {
          ...baseSelect,
          meshtasticRx: {
            select: {
              rxRssi: true,
              rxSnr: true,
              hopLimit: true,
              relayNode: true,
              transportMechanism: true,
              rxTime: true
            }
          }
        }
      });

      const totalBeforeSample = items.length;
      const sampled = params.sample ? sampleItems(items, params.sample) : items;

      return {
        count: sampled.length,
        limit: params.limit,
        totalBeforeSample,
        returnedAfterSample: sampled.length,
        items: sampled.map((item) => ({
          ...item,
          meshtasticRx: item.meshtasticRx
            ? {
                rxRssi: item.meshtasticRx.rxRssi,
                rxSnr: item.meshtasticRx.rxSnr,
                hopLimit: item.meshtasticRx.hopLimit,
                relayNode: item.meshtasticRx.relayNode,
                transportMechanism: item.meshtasticRx.transportMechanism,
                rxTime: item.meshtasticRx.rxTime
              }
            : null
        }))
      };
    }

    const items = await this.prisma.measurement.findMany({
      where,
      orderBy: { capturedAt: 'asc' },
      take: params.limit,
      select: baseSelect
    });

    const totalBeforeSample = items.length;
    const sampled = params.sample ? sampleItems(items, params.sample) : items;

    return {
      count: sampled.length,
      limit: params.limit,
      totalBeforeSample,
      returnedAfterSample: sampled.length,
      items: sampled
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

function sampleItems<T>(items: T[], sample: number): T[] {
  if (sample <= 0 || items.length === 0) {
    return [];
  }
  if (sample >= items.length) {
    return items;
  }
  if (sample === 1) {
    return [items[0]];
  }
  const lastIndex = items.length - 1;
  const result: T[] = [];
  for (let i = 0; i < sample; i += 1) {
    const index = Math.floor((i * lastIndex) / (sample - 1));
    result.push(items[index]);
  }
  return result;
}

function getSummaryFromRxMetadata(
  rxMetadata: Prisma.InputJsonValue | undefined
): { gatewayId: string; rssi?: number; snr?: number } | null {
  if (!Array.isArray(rxMetadata) || rxMetadata.length === 0) {
    return null;
  }
  let best: { gatewayId: string; rssi?: number; snr?: number } | null = null;
  for (const entry of rxMetadata) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const gatewayId = (entry as any)?.gateway_ids?.gateway_id;
    if (!gatewayId || typeof gatewayId !== 'string') {
      continue;
    }
    const rssiValue = (entry as any)?.rssi;
    const snrValue = (entry as any)?.snr;
    const rssi = typeof rssiValue === 'number' && Number.isFinite(rssiValue) ? Math.round(rssiValue) : undefined;
    const snr = typeof snrValue === 'number' && Number.isFinite(snrValue) ? snrValue : undefined;
    if (!best) {
      best = { gatewayId, rssi, snr };
      continue;
    }
    const bestSnr = best.snr ?? -Infinity;
    const bestRssi = best.rssi ?? -Infinity;
    const candidateSnr = snr ?? -Infinity;
    const candidateRssi = rssi ?? -Infinity;
    if (candidateSnr > bestSnr || (candidateSnr === bestSnr && candidateRssi > bestRssi)) {
      best = { gatewayId, rssi, snr };
    }
  }
  return best;
}
