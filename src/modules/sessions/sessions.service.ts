import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StartSessionDto } from './dto/start-session.dto';
import { StopSessionDto } from './dto/stop-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

type SignalSummary = {
  min: number | null;
  max: number | null;
  avg: number | null;
};

type SignalSeriesMetric = 'rssi' | 'snr';
type SignalSeriesSource = 'auto' | 'meshtastic' | 'lorawan' | 'measurement';
type SignalSeriesResolvedSource = Exclude<SignalSeriesSource, 'auto'>;
type SignalSeriesItem = { t: string; v: number };
type RawSignalRow = { t: Date; v: number | Prisma.Decimal | null };
type SignalHistogramBin = { lo: number; hi: number; count: number };

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService) {}

  async start(dto: StartSessionDto) {
    const device = await this.prisma.device.findUnique({
      where: { id: dto.deviceId },
      select: { id: true }
    });
    if (!device) {
      throw new NotFoundException('Device not found');
    }

    return this.prisma.session.create({
      data: {
        device: {
          connect: { id: dto.deviceId }
        },
        name: dto.name ?? undefined,
        startedAt: new Date()
      }
    });
  }

  async stop(dto: StopSessionDto) {
    const session = await this.prisma.session.findUnique({
      where: { id: dto.sessionId },
      select: { id: true }
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    return this.prisma.session.update({
      where: { id: dto.sessionId },
      data: {
        endedAt: new Date()
      }
    });
  }

  async update(id: string, dto: UpdateSessionDto) {
    const existing = await this.prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        isArchived: true
      }
    });
    if (!existing) {
      throw new NotFoundException('Session not found');
    }

    const data: {
      name?: string;
      notes?: string;
      isArchived?: boolean;
      archivedAt?: Date | null;
    } = {};

    if (dto.name !== undefined) {
      data.name = dto.name;
    }
    if (dto.notes !== undefined) {
      data.notes = dto.notes;
    }
    if (dto.isArchived !== undefined) {
      data.isArchived = dto.isArchived;
      if (dto.isArchived !== existing.isArchived) {
        data.archivedAt = dto.isArchived ? new Date() : null;
      }
    }

    if (Object.keys(data).length === 0) {
      return this.prisma.session.findUnique({
        where: { id }
      });
    }

    return this.prisma.session.update({
      where: { id },
      data
    });
  }

  async archive(id: string): Promise<boolean> {
    const existing = await this.prisma.session.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!existing) {
      return false;
    }

    await this.prisma.session.update({
      where: { id },
      data: {
        isArchived: true,
        archivedAt: new Date()
      }
    });
    return true;
  }

  async deleteWithDetachedMeasurements(
    id: string
  ): Promise<{ detachedMeasurementsCount: number } | null> {
    const existing = await this.prisma.session.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!existing) {
      return null;
    }

    const detachedMeasurementsCount = await this.prisma.$transaction(async (tx) => {
      const detached = await tx.measurement.updateMany({
        where: { sessionId: id },
        data: { sessionId: null }
      });

      await tx.session.delete({
        where: { id }
      });

      return detached.count;
    });

    return { detachedMeasurementsCount };
  }

  async list(deviceId?: string, includeArchived = false) {
    const where = {
      ...(deviceId ? { deviceId } : {}),
      ...(includeArchived ? {} : { isArchived: false })
    };
    return this.prisma.session.findMany({
      where,
      orderBy: { startedAt: 'desc' }
    });
  }

  async getById(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        deviceId: true,
        ownerId: true,
        name: true,
        startedAt: true,
        endedAt: true,
        notes: true,
        isArchived: true,
        archivedAt: true,
        updatedAt: true,
        _count: {
          select: {
            measurements: true
          }
        }
      }
    });

    if (!session) {
      return null;
    }

    return {
      id: session.id,
      deviceId: session.deviceId,
      ownerId: session.ownerId,
      name: session.name,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      notes: session.notes,
      isArchived: session.isArchived,
      archivedAt: session.archivedAt,
      updatedAt: session.updatedAt,
      measurementCount: session._count.measurements
    };
  }

  async getTimeline(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        deviceId: true,
        startedAt: true,
        endedAt: true
      }
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const aggregate = await this.prisma.measurement.aggregate({
      where: { sessionId: id },
      _count: { _all: true },
      _min: { capturedAt: true },
      _max: { capturedAt: true }
    });

    return {
      sessionId: session.id,
      deviceId: session.deviceId,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      minCapturedAt: aggregate._min.capturedAt ? aggregate._min.capturedAt.toISOString() : null,
      maxCapturedAt: aggregate._max.capturedAt ? aggregate._max.capturedAt.toISOString() : null,
      count: aggregate._count._all
    };
  }

  async getWindow(params: {
    sessionId: string;
    cursor: Date;
    windowMs: number;
    limit: number;
    sample?: number;
  }) {
    const halfWindow = params.windowMs / 2;
    const from = new Date(params.cursor.getTime() - halfWindow);
    const to = new Date(params.cursor.getTime() + halfWindow);

    const items = await this.prisma.measurement.findMany({
      where: {
        sessionId: params.sessionId,
        capturedAt: {
          gte: from,
          lte: to
        }
      },
      orderBy: { capturedAt: 'asc' },
      take: params.limit,
      select: {
        id: true,
        capturedAt: true,
        lat: true,
        lon: true,
        rssi: true,
        snr: true,
        gatewayId: true,
        sf: true,
        bw: true,
        freq: true
      }
    });

    const totalBeforeSample = items.length;
    const sampled = params.sample ? sampleItems(items, params.sample) : items;

    return {
      sessionId: params.sessionId,
      cursor: params.cursor.toISOString(),
      from: from.toISOString(),
      to: to.toISOString(),
      totalBeforeSample,
      returnedAfterSample: sampled.length,
      items: sampled.map((item) => ({
        ...item,
        capturedAt: item.capturedAt.toISOString()
      }))
    };
  }

  async getOverview(id: string, sample: number) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const items = await this.prisma.measurement.findMany({
      where: { sessionId: id },
      orderBy: { capturedAt: 'asc' },
      select: {
        capturedAt: true,
        lat: true,
        lon: true
      }
    });

    const sampled = sampleItems(items, sample);

    return {
      sessionId: session.id,
      items: sampled.map((item) => ({
        capturedAt: item.capturedAt.toISOString(),
        lat: item.lat,
        lon: item.lon
      }))
    };
  }

  async getStats(id: string) {
    const session = await this.prisma.session.findUnique({
      where: { id },
      select: {
        id: true,
        deviceId: true,
        startedAt: true,
        endedAt: true
      }
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const aggregate = await this.prisma.measurement.aggregate({
      where: { sessionId: id },
      _count: { _all: true },
      _min: {
        capturedAt: true,
        lat: true,
        lon: true
      },
      _max: {
        capturedAt: true,
        lat: true,
        lon: true
      }
    });

    const pointCount = aggregate._count._all;
    const bbox =
      aggregate._min.lat !== null &&
      aggregate._min.lon !== null &&
      aggregate._max.lat !== null &&
      aggregate._max.lon !== null
        ? {
            minLat: aggregate._min.lat,
            minLon: aggregate._min.lon,
            maxLat: aggregate._max.lat,
            maxLon: aggregate._max.lon
          }
        : null;

    const [distanceMeters, signalSummary] = await Promise.all([
      this.computeDistanceMeters(id, pointCount),
      this.computeSignalSummary(id)
    ]);

    return {
      sessionId: session.id,
      deviceId: session.deviceId,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      minCapturedAt: aggregate._min.capturedAt ? aggregate._min.capturedAt.toISOString() : null,
      maxCapturedAt: aggregate._max.capturedAt ? aggregate._max.capturedAt.toISOString() : null,
      pointCount,
      distanceMeters,
      bbox,
      rssi: signalSummary.rssi,
      snr: signalSummary.snr,
      receiversCount: signalSummary.receiversCount
    };
  }

  async getSignalSeries(params: {
    sessionId: string;
    metric: SignalSeriesMetric;
    source: SignalSeriesSource;
    sample: number;
  }) {
    const session = await this.prisma.session.findUnique({
      where: { id: params.sessionId },
      select: { id: true }
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const sourceUsed =
      params.source === 'auto'
        ? await this.resolveSignalSeriesSource(params.sessionId, params.metric)
        : params.source;
    const rows = await this.readSignalSeriesRows(params.sessionId, params.metric, sourceUsed);
    const sampledRows = rows.length > params.sample ? sampleItems(rows, params.sample) : rows;

    const items: SignalSeriesItem[] = [];
    for (const row of sampledRows) {
      if (!(row.t instanceof Date)) {
        continue;
      }
      const value = toNumeric(row.v);
      if (value === null) {
        continue;
      }
      items.push({
        t: row.t.toISOString(),
        v: value
      });
    }

    return {
      sessionId: params.sessionId,
      metric: params.metric,
      sourceUsed,
      items
    };
  }

  async getSignalHistogram(params: {
    sessionId: string;
    metric: SignalSeriesMetric;
    source: SignalSeriesSource;
    bins: number;
  }) {
    const session = await this.prisma.session.findUnique({
      where: { id: params.sessionId },
      select: { id: true }
    });
    if (!session) {
      throw new NotFoundException('Session not found');
    }

    const sourceUsed =
      params.source === 'auto'
        ? await this.resolveSignalSeriesSource(params.sessionId, params.metric)
        : params.source;
    const rows = await this.readSignalSeriesRows(params.sessionId, params.metric, sourceUsed);

    const values = rows
      .map((row) => toNumeric(row.v))
      .filter((value): value is number => value !== null && Number.isFinite(value));

    return {
      sessionId: params.sessionId,
      metric: params.metric,
      sourceUsed,
      bins: buildSignalHistogram(values, params.bins)
    };
  }

  async startForDeviceUid(deviceUid: string, name?: string) {
    const device = await this.prisma.device.findUnique({
      where: { deviceUid },
      select: { id: true }
    });
    if (!device) {
      return null;
    }

    const existing = await this.prisma.session.findFirst({
      where: { deviceId: device.id, endedAt: null },
      orderBy: { startedAt: 'desc' }
    });
    if (existing) {
      return existing;
    }

    return this.prisma.session.create({
      data: {
        deviceId: device.id,
        name: name ?? undefined,
        startedAt: new Date()
      }
    });
  }

  async stopForDeviceUid(deviceUid: string) {
    const device = await this.prisma.device.findUnique({
      where: { deviceUid },
      select: { id: true }
    });
    if (!device) {
      return null;
    }

    const active = await this.prisma.session.findFirst({
      where: { deviceId: device.id, endedAt: null },
      orderBy: { startedAt: 'desc' }
    });

    if (!active) {
      return { stopped: false };
    }

    const session = await this.prisma.session.update({
      where: { id: active.id },
      data: { endedAt: new Date() }
    });

    return { stopped: true, session };
  }

  private async computeDistanceMeters(sessionId: string, pointCount: number): Promise<number | null> {
    if (pointCount < 2) {
      return null;
    }

    const sampledPoints = await this.prisma.$queryRaw<Array<{ lat: number; lon: number }>>(
      Prisma.sql`
        WITH ordered AS (
          SELECT
            m."lat",
            m."lon",
            row_number() OVER (ORDER BY m."capturedAt" ASC, m."id" ASC) AS rn,
            ntile(5000) OVER (ORDER BY m."capturedAt" ASC, m."id" ASC) AS bucket
          FROM "Measurement" m
          WHERE m."sessionId" = ${sessionId}::uuid
            AND m."lat" IS NOT NULL
            AND m."lon" IS NOT NULL
        ),
        sampled AS (
          SELECT DISTINCT ON (bucket)
            bucket,
            rn,
            "lat",
            "lon"
          FROM ordered
          ORDER BY bucket, rn
        )
        SELECT "lat", "lon"
        FROM sampled
        ORDER BY rn ASC
      `
    );

    if (sampledPoints.length < 2) {
      return null;
    }

    let total = 0;
    let previous = sampledPoints[0];
    for (let i = 1; i < sampledPoints.length; i += 1) {
      const current = sampledPoints[i];
      if (
        !Number.isFinite(previous.lat) ||
        !Number.isFinite(previous.lon) ||
        !Number.isFinite(current.lat) ||
        !Number.isFinite(current.lon)
      ) {
        previous = current;
        continue;
      }

      total += haversineMeters(previous.lat, previous.lon, current.lat, current.lon);
      previous = current;
    }

    return Number.isFinite(total) ? total : null;
  }

  private async computeSignalSummary(sessionId: string): Promise<{
    rssi: SignalSummary | null;
    snr: SignalSummary | null;
    receiversCount: number | null;
  }> {
    const meshtasticAggregate = await this.prisma.meshtasticRx.aggregate({
      where: {
        measurement: { sessionId }
      },
      _count: { _all: true },
      _min: {
        rxRssi: true,
        rxSnr: true
      },
      _max: {
        rxRssi: true,
        rxSnr: true
      },
      _avg: {
        rxRssi: true,
        rxSnr: true
      }
    });

    if (meshtasticAggregate._count._all > 0) {
      const receivers = await this.prisma.measurement.groupBy({
        by: ['gatewayId'],
        where: {
          sessionId,
          gatewayId: { not: null }
        }
      });

      return {
        rssi: toSignalSummary(
          meshtasticAggregate._min.rxRssi,
          meshtasticAggregate._max.rxRssi,
          meshtasticAggregate._avg.rxRssi
        ),
        snr: toSignalSummary(
          meshtasticAggregate._min.rxSnr,
          meshtasticAggregate._max.rxSnr,
          meshtasticAggregate._avg.rxSnr
        ),
        receiversCount: receivers.length > 0 ? receivers.length : null
      };
    }

    const lorawanAggregate = await this.prisma.rxMetadata.aggregate({
      where: {
        measurement: { sessionId }
      },
      _count: { _all: true },
      _min: {
        rssi: true,
        snr: true
      },
      _max: {
        rssi: true,
        snr: true
      },
      _avg: {
        rssi: true,
        snr: true
      }
    });

    if (lorawanAggregate._count._all > 0) {
      const receivers = await this.prisma.rxMetadata.groupBy({
        by: ['gatewayId'],
        where: {
          measurement: { sessionId }
        }
      });

      return {
        rssi: toSignalSummary(
          lorawanAggregate._min.rssi,
          lorawanAggregate._max.rssi,
          lorawanAggregate._avg.rssi
        ),
        snr: toSignalSummary(
          lorawanAggregate._min.snr,
          lorawanAggregate._max.snr,
          lorawanAggregate._avg.snr
        ),
        receiversCount: receivers.length > 0 ? receivers.length : null
      };
    }

    const fallbackSignalCount = await this.prisma.measurement.count({
      where: {
        sessionId,
        OR: [{ rssi: { not: null } }, { snr: { not: null } }]
      }
    });

    if (fallbackSignalCount === 0) {
      return {
        rssi: null,
        snr: null,
        receiversCount: null
      };
    }

    const fallbackAggregate = await this.prisma.measurement.aggregate({
      where: { sessionId },
      _min: {
        rssi: true,
        snr: true
      },
      _max: {
        rssi: true,
        snr: true
      },
      _avg: {
        rssi: true,
        snr: true
      }
    });

    const receivers = await this.prisma.measurement.groupBy({
      by: ['gatewayId'],
      where: {
        sessionId,
        gatewayId: { not: null }
      }
    });

    return {
      rssi: toSignalSummary(
        fallbackAggregate._min.rssi,
        fallbackAggregate._max.rssi,
        fallbackAggregate._avg.rssi
      ),
      snr: toSignalSummary(
        fallbackAggregate._min.snr,
        fallbackAggregate._max.snr,
        fallbackAggregate._avg.snr
      ),
      receiversCount: receivers.length > 0 ? receivers.length : null
    };
  }

  private async resolveSignalSeriesSource(
    sessionId: string,
    metric: SignalSeriesMetric
  ): Promise<SignalSeriesResolvedSource> {
    const [hasMeshtastic, hasLorawan] = await Promise.all([
      this.hasMeshtasticSignalMetric(sessionId, metric),
      this.hasLorawanSignalMetric(sessionId, metric)
    ]);
    if (hasMeshtastic) {
      return 'meshtastic';
    }
    if (hasLorawan) {
      return 'lorawan';
    }
    return 'measurement';
  }

  private async hasMeshtasticSignalMetric(
    sessionId: string,
    metric: SignalSeriesMetric
  ): Promise<boolean> {
    const count = await this.prisma.meshtasticRx.count({
      where: {
        measurement: { sessionId },
        ...(metric === 'rssi' ? { rxRssi: { not: null } } : { rxSnr: { not: null } })
      }
    });
    return count > 0;
  }

  private async hasLorawanSignalMetric(sessionId: string, metric: SignalSeriesMetric): Promise<boolean> {
    const count = await this.prisma.rxMetadata.count({
      where: {
        measurement: { sessionId },
        ...(metric === 'rssi' ? { rssi: { not: null } } : { snr: { not: null } })
      }
    });
    return count > 0;
  }

  private async readSignalSeriesRows(
    sessionId: string,
    metric: SignalSeriesMetric,
    source: SignalSeriesResolvedSource
  ): Promise<RawSignalRow[]> {
    if (source === 'meshtastic') {
      return this.readMeshtasticSignalSeriesRows(sessionId, metric);
    }
    if (source === 'lorawan') {
      return this.readLorawanSignalSeriesRows(sessionId, metric);
    }
    return this.readMeasurementSignalSeriesRows(sessionId, metric);
  }

  private async readMeshtasticSignalSeriesRows(
    sessionId: string,
    metric: SignalSeriesMetric
  ): Promise<RawSignalRow[]> {
    if (metric === 'rssi') {
      return this.prisma.$queryRaw<RawSignalRow[]>(
        Prisma.sql`
          SELECT
            m."capturedAt" AS t,
            mx."rxRssi" AS v
          FROM "MeshtasticRx" mx
          INNER JOIN "Measurement" m ON m."id" = mx."measurementId"
          WHERE
            m."sessionId" = ${sessionId}::uuid
            AND mx."rxRssi" IS NOT NULL
          ORDER BY m."capturedAt" ASC, m."id" ASC
        `
      );
    }

    return this.prisma.$queryRaw<RawSignalRow[]>(
      Prisma.sql`
        SELECT
          m."capturedAt" AS t,
          mx."rxSnr" AS v
        FROM "MeshtasticRx" mx
        INNER JOIN "Measurement" m ON m."id" = mx."measurementId"
        WHERE
          m."sessionId" = ${sessionId}::uuid
          AND mx."rxSnr" IS NOT NULL
        ORDER BY m."capturedAt" ASC, m."id" ASC
      `
    );
  }

  private async readLorawanSignalSeriesRows(
    sessionId: string,
    metric: SignalSeriesMetric
  ): Promise<RawSignalRow[]> {
    type LorawanSignalRow = RawSignalRow & { measurementId: string };

    if (metric === 'rssi') {
      const rows = await this.prisma.$queryRaw<LorawanSignalRow[]>(
        Prisma.sql`
          WITH ranked AS (
            SELECT
              m."capturedAt" AS t,
              m."id" AS "measurementId",
              rx."rssi",
              rx."snr",
              row_number() OVER (
                PARTITION BY m."id"
                ORDER BY rx."snr" DESC NULLS LAST, rx."rssi" DESC NULLS LAST, rx."gatewayId" ASC
              ) AS rn
            FROM "RxMetadata" rx
            INNER JOIN "Measurement" m ON m."id" = rx."measurementId"
            WHERE m."sessionId" = ${sessionId}::uuid
          )
          SELECT
            t,
            "rssi" AS v,
            "measurementId"
          FROM ranked
          WHERE rn = 1 AND "rssi" IS NOT NULL
          ORDER BY t ASC, "measurementId" ASC
        `
      );
      return rows.map((row) => ({ t: row.t, v: row.v }));
    }

    const rows = await this.prisma.$queryRaw<LorawanSignalRow[]>(
      Prisma.sql`
        WITH ranked AS (
          SELECT
            m."capturedAt" AS t,
            m."id" AS "measurementId",
            rx."rssi",
            rx."snr",
            row_number() OVER (
              PARTITION BY m."id"
              ORDER BY rx."snr" DESC NULLS LAST, rx."rssi" DESC NULLS LAST, rx."gatewayId" ASC
            ) AS rn
          FROM "RxMetadata" rx
          INNER JOIN "Measurement" m ON m."id" = rx."measurementId"
          WHERE m."sessionId" = ${sessionId}::uuid
        )
        SELECT
          t,
          "snr" AS v,
          "measurementId"
        FROM ranked
        WHERE rn = 1 AND "snr" IS NOT NULL
        ORDER BY t ASC, "measurementId" ASC
      `
    );
    return rows.map((row) => ({ t: row.t, v: row.v }));
  }

  private async readMeasurementSignalSeriesRows(
    sessionId: string,
    metric: SignalSeriesMetric
  ): Promise<RawSignalRow[]> {
    if (metric === 'rssi') {
      return this.prisma.$queryRaw<RawSignalRow[]>(
        Prisma.sql`
          SELECT
            m."capturedAt" AS t,
            m."rssi" AS v
          FROM "Measurement" m
          WHERE
            m."sessionId" = ${sessionId}::uuid
            AND m."rssi" IS NOT NULL
          ORDER BY m."capturedAt" ASC, m."id" ASC
        `
      );
    }

    return this.prisma.$queryRaw<RawSignalRow[]>(
      Prisma.sql`
        SELECT
          m."capturedAt" AS t,
          m."snr" AS v
        FROM "Measurement" m
        WHERE
          m."sessionId" = ${sessionId}::uuid
          AND m."snr" IS NOT NULL
        ORDER BY m."capturedAt" ASC, m."id" ASC
      `
    );
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

function buildSignalHistogram(values: number[], bins: number): SignalHistogramBin[] {
  if (values.length === 0) {
    return [];
  }

  let min = values[0];
  let max = values[0];
  for (const value of values) {
    if (value < min) {
      min = value;
    }
    if (value > max) {
      max = value;
    }
  }

  if (min === max) {
    return [{ lo: min, hi: max, count: values.length }];
  }

  const width = (max - min) / bins;
  const histogram: SignalHistogramBin[] = Array.from({ length: bins }, (_, index) => {
    const lo = min + width * index;
    const hi = index === bins - 1 ? max : min + width * (index + 1);
    return { lo, hi, count: 0 };
  });

  for (const value of values) {
    let index = Math.floor((value - min) / width);
    if (!Number.isFinite(index)) {
      continue;
    }
    if (index < 0) {
      index = 0;
    } else if (index >= bins) {
      index = bins - 1;
    }
    histogram[index].count += 1;
  }

  return histogram;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const lat1Rad = toRadians(lat1);
  const lat2Rad = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMeters * c;
}

function toSignalSummary(
  min: number | Prisma.Decimal | null | undefined,
  max: number | Prisma.Decimal | null | undefined,
  avg: number | Prisma.Decimal | null | undefined
): SignalSummary | null {
  const minValue = toNumeric(min);
  const maxValue = toNumeric(max);
  const avgValue = toNumeric(avg);
  if (minValue === null && maxValue === null && avgValue === null) {
    return null;
  }
  return {
    min: minValue,
    max: maxValue,
    avg: avgValue
  };
}

function toNumeric(value: number | Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof (value as Prisma.Decimal).toNumber === 'function') {
    const converted = (value as Prisma.Decimal).toNumber();
    return Number.isFinite(converted) ? converted : null;
  }
  return null;
}
