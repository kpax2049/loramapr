import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const BIN_SIZE = 0.001;
const BATCH_SIZE = 500;
const INTERVAL_MS = 10_000;

type Cursor = {
  ingestedAt: Date;
  id: string;
};

type BinKey = {
  deviceId: string;
  sessionId: string | null;
  gatewayId: string | null;
  day: Date;
  latBin: number;
  lonBin: number;
};

@Injectable()
export class CoverageWorker implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private cursor: Cursor | null = null;

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

  private async runOnce(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      const measurements = await this.loadMeasurements();
      if (measurements.length === 0) {
        return;
      }

      const bins = new Map<string, BinKey>();
      for (const measurement of measurements) {
        const day = startOfUtcDay(measurement.capturedAt);
        const latBin = Math.floor(measurement.lat / BIN_SIZE);
        const lonBin = Math.floor(measurement.lon / BIN_SIZE);
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
      this.isProcessing = false;
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

  private async upsertCoverageBin(bin: BinKey): Promise<void> {
    const dayStart = bin.day;
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const latMin = bin.latBin * BIN_SIZE;
    const latMax = (bin.latBin + 1) * BIN_SIZE;
    const lonMin = bin.lonBin * BIN_SIZE;
    const lonMax = (bin.lonBin + 1) * BIN_SIZE;

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
        count: aggregate._count._all,
        rssiAvg: aggregate._avg.rssi ?? null,
        snrAvg: aggregate._avg.snr ?? null,
        rssiMin: aggregate._min.rssi ?? null,
        rssiMax: aggregate._max.rssi ?? null,
        snrMin: aggregate._min.snr ?? null,
        snrMax: aggregate._max.snr ?? null
      },
      update: {
        count: aggregate._count._all,
        rssiAvg: aggregate._avg.rssi ?? null,
        snrAvg: aggregate._avg.snr ?? null,
        rssiMin: aggregate._min.rssi ?? null,
        rssiMax: aggregate._max.rssi ?? null,
        snrMin: aggregate._min.snr ?? null,
        snrMax: aggregate._max.snr ?? null
      }
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
