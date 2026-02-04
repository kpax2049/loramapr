import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const BIN_SIZE_DEG = 0.001;
const BATCH_SIZE = 500;
const INTERVAL_MS = 10_000;

type CoverageQueryParams = {
  deviceId?: string;
  sessionId?: string;
  day: Date;
  bbox?: {
    minLon: number;
    minLat: number;
    maxLon: number;
    maxLat: number;
  };
  gatewayId?: string;
  limit: number;
};

@Injectable()
export class CoverageService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private cursor: { ingestedAt: Date; id: string } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    if (!isCoverageWorkerEnabled()) {
      return;
    }
    this.timer = setInterval(() => {
      void this.runOnce();
    }, INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async listBins(params: CoverageQueryParams) {
    const where: Record<string, unknown> = {
      day: params.day
    };

    if (params.deviceId) {
      where.deviceId = params.deviceId;
    }
    if (params.sessionId) {
      where.sessionId = params.sessionId;
    }
    if (params.gatewayId) {
      where.gatewayId = params.gatewayId;
    }

    if (params.bbox) {
      const latBinMin = Math.floor(params.bbox.minLat / BIN_SIZE_DEG);
      const latBinMax = Math.floor(params.bbox.maxLat / BIN_SIZE_DEG);
      const lonBinMin = Math.floor(params.bbox.minLon / BIN_SIZE_DEG);
      const lonBinMax = Math.floor(params.bbox.maxLon / BIN_SIZE_DEG);
      where.latBin = { gte: latBinMin, lte: latBinMax };
      where.lonBin = { gte: lonBinMin, lte: lonBinMax };
    }

    return this.prisma.coverageBin.findMany({
      where,
      take: params.limit,
      select: {
        latBin: true,
        lonBin: true,
        count: true,
        rssiAvg: true,
        snrAvg: true,
        rssiMin: true,
        rssiMax: true,
        snrMin: true,
        snrMax: true,
        gatewayId: true
      }
    });
  }

  async aggregateOnce(): Promise<void> {
    await this.runOnce(true);
  }

  async aggregateForDeviceDay(deviceId: string, day: Date): Promise<void> {
    const dayStart = startOfUtcDay(day);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const measurements = await this.prisma.measurement.findMany({
      where: {
        deviceId,
        capturedAt: { gte: dayStart, lt: dayEnd }
      },
      select: {
        id: true,
        deviceId: true,
        sessionId: true,
        gatewayId: true,
        capturedAt: true,
        lat: true,
        lon: true
      }
    });

    if (measurements.length === 0) {
      return;
    }

    const bins = new Map<string, {
      deviceId: string;
      sessionId: string | null;
      gatewayId: string | null;
      day: Date;
      latBin: number;
      lonBin: number;
    }>();

    for (const measurement of measurements) {
      const binDay = startOfUtcDay(measurement.capturedAt);
      const latBin = Math.floor(measurement.lat / BIN_SIZE_DEG);
      const lonBin = Math.floor(measurement.lon / BIN_SIZE_DEG);
      const sessionId = measurement.sessionId ?? null;
      const gatewayId = measurement.gatewayId ?? null;
      const key = [
        measurement.deviceId,
        sessionId ?? 'null',
        gatewayId ?? 'null',
        binDay.toISOString(),
        latBin,
        lonBin
      ].join('|');

      if (!bins.has(key)) {
        bins.set(key, {
          deviceId: measurement.deviceId,
          sessionId,
          gatewayId,
          day: binDay,
          latBin,
          lonBin
        });
      }
    }

    for (const bin of bins.values()) {
      await this.upsertCoverageBin(bin);
    }
  }

  private async runOnce(force: boolean = false): Promise<void> {
    if (this.isProcessing) {
      if (!force) {
        return;
      }
    }
    const wasProcessing = this.isProcessing;
    this.isProcessing = true;
    try {
      const measurements = await this.loadMeasurements();
      if (measurements.length === 0) {
        return;
      }

      const bins = new Map<string, {
        deviceId: string;
        sessionId: string | null;
        gatewayId: string | null;
        day: Date;
        latBin: number;
        lonBin: number;
      }>();

      for (const measurement of measurements) {
        const day = startOfUtcDay(measurement.capturedAt);
        const latBin = Math.floor(measurement.lat / BIN_SIZE_DEG);
        const lonBin = Math.floor(measurement.lon / BIN_SIZE_DEG);
        const sessionId = measurement.sessionId ?? null;
        const gatewayId = measurement.gatewayId ?? null;
        const key = [
          measurement.deviceId,
          sessionId ?? 'null',
          gatewayId ?? 'null',
          day.toISOString(),
          latBin,
          lonBin
        ].join('|');

        if (!bins.has(key)) {
          bins.set(key, {
            deviceId: measurement.deviceId,
            sessionId,
            gatewayId,
            day,
            latBin,
            lonBin
          });
        }
      }

      for (const bin of bins.values()) {
        await this.upsertCoverageBin(bin);
      }
    } finally {
      this.isProcessing = wasProcessing;
    }
  }

  private async loadMeasurements() {
    const where = this.cursor
      ? {
          OR: [
            { ingestedAt: { gt: this.cursor.ingestedAt } },
            { ingestedAt: this.cursor.ingestedAt, id: { gt: this.cursor.id } }
          ]
        }
      : undefined;

    const measurements = await this.prisma.measurement.findMany({
      where,
      orderBy: [{ ingestedAt: 'asc' }, { id: 'asc' }],
      take: BATCH_SIZE,
      select: {
        id: true,
        deviceId: true,
        sessionId: true,
        gatewayId: true,
        capturedAt: true,
        lat: true,
        lon: true,
        ingestedAt: true
      }
    });

    if (measurements.length > 0) {
      const last = measurements[measurements.length - 1];
      this.cursor = { ingestedAt: last.ingestedAt, id: last.id };
    }

    return measurements;
  }

  private async upsertCoverageBin(bin: {
    deviceId: string;
    sessionId: string | null;
    gatewayId: string | null;
    day: Date;
    latBin: number;
    lonBin: number;
  }): Promise<void> {
    const dayStart = bin.day;
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const latMin = bin.latBin * BIN_SIZE_DEG;
    const latMax = (bin.latBin + 1) * BIN_SIZE_DEG;
    const lonMin = bin.lonBin * BIN_SIZE_DEG;
    const lonMax = (bin.lonBin + 1) * BIN_SIZE_DEG;

    const aggregate = await this.prisma.measurement.aggregate({
      where: {
        deviceId: bin.deviceId,
        sessionId: bin.sessionId,
        gatewayId: bin.gatewayId,
        capturedAt: { gte: dayStart, lt: dayEnd },
        lat: { gte: latMin, lt: latMax },
        lon: { gte: lonMin, lt: lonMax }
      },
      _count: { _all: true },
      _avg: { rssi: true, snr: true },
      _min: { rssi: true, snr: true },
      _max: { rssi: true, snr: true }
    });

    const data = {
      count: aggregate._count._all,
      rssiAvg: aggregate._avg.rssi ?? null,
      snrAvg: aggregate._avg.snr ?? null,
      rssiMin: aggregate._min.rssi ?? null,
      rssiMax: aggregate._max.rssi ?? null,
      snrMin: aggregate._min.snr ?? null,
      snrMax: aggregate._max.snr ?? null
    };

    if (bin.sessionId === null || bin.gatewayId === null) {
      const existing = await this.prisma.coverageBin.findFirst({
        where: {
          deviceId: bin.deviceId,
          sessionId: bin.sessionId,
          gatewayId: bin.gatewayId,
          day: bin.day,
          latBin: bin.latBin,
          lonBin: bin.lonBin
        },
        select: { id: true }
      });

      if (existing) {
        await this.prisma.coverageBin.update({
          where: { id: existing.id },
          data
        });
        return;
      }

      await this.prisma.coverageBin.create({
        data: {
          deviceId: bin.deviceId,
          sessionId: bin.sessionId,
          gatewayId: bin.gatewayId,
          day: bin.day,
          latBin: bin.latBin,
          lonBin: bin.lonBin,
          ...data
        }
      });
      return;
    }

    await this.prisma.coverageBin.upsert({
      where: {
        deviceId_sessionId_gatewayId_day_latBin_lonBin: {
          deviceId: bin.deviceId,
          sessionId: bin.sessionId,
          gatewayId: bin.gatewayId,
          day: bin.day,
          latBin: bin.latBin,
          lonBin: bin.lonBin
        }
      },
      create: {
        deviceId: bin.deviceId,
        sessionId: bin.sessionId,
        gatewayId: bin.gatewayId,
        day: bin.day,
        latBin: bin.latBin,
        lonBin: bin.lonBin,
        ...data
      },
      update: data
    });
  }
}

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function isCoverageWorkerEnabled(): boolean {
  const flag = process.env.COVERAGE_WORKER_ENABLED;
  if (flag === undefined || flag === '') {
    return true;
  }
  return flag.toLowerCase() === 'true';
}
