import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MeasurementsService } from '../measurements/measurements.service';
import { normalizeTtsUplinkToMeasurement } from './tts-normalize';
import type { TtsUplink } from './tts-uplink.schema';
import { deriveUplinkId } from './uplink-id';

@Injectable()
export class LorawanService implements OnModuleInit, OnModuleDestroy {
  private workerTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly workerId = randomUUID();

  constructor(
    private readonly prisma: PrismaService,
    private readonly measurementsService: MeasurementsService
  ) {}

  onModuleInit(): void {
    if (!isWorkerEnabled()) {
      return;
    }
    this.workerTimer = setInterval(() => {
      void this.runWorkerOnce();
    }, 2000);
  }

  onModuleDestroy(): void {
    if (this.workerTimer) {
      clearInterval(this.workerTimer);
      this.workerTimer = null;
    }
  }

  async enqueueUplink(parsed: TtsUplink): Promise<void> {
    const deviceUid =
      parsed.end_device_ids?.dev_eui ?? parsed.end_device_ids?.device_id ?? undefined;
    const uplinkId = deriveUplinkId(parsed);

    try {
      await this.prisma.webhookEvent.create({
        data: {
          source: 'tts',
          eventType: 'uplink',
          deviceUid,
          uplinkId,
          payload: parsed as Prisma.InputJsonValue
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
  }) {
    const where: Record<string, unknown> = {};
    if (params.deviceUid) {
      where.deviceUid = params.deviceUid;
    }
    if (params.processingError) {
      where.processingError = params.processingError;
    }
    if (params.processed !== undefined) {
      where.processedAt = params.processed ? { not: null } : null;
    }
    return this.prisma.webhookEvent.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { receivedAt: 'desc' },
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
    return this.prisma.webhookEvent.findUnique({
      where: { id },
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

  async reprocessEvent(id: string): Promise<boolean> {
    const result = await this.prisma.webhookEvent.updateMany({
      where: { id },
      data: {
        processedAt: null,
        processingError: null,
        processingStartedAt: null,
        processingWorkerId: null
      }
    });
    return result.count > 0;
  }

  async reprocessEvents(params: {
    deviceUid?: string;
    since?: Date;
    processingError?: string;
    limit: number;
  }): Promise<number> {
    const where: Record<string, unknown> = {};
    if (params.deviceUid) {
      where.deviceUid = params.deviceUid;
    }
    if (params.processingError) {
      where.processingError = params.processingError;
    }
    if (params.since) {
      where.receivedAt = { gte: params.since };
    }

    const ids = await this.prisma.webhookEvent.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { receivedAt: 'asc' },
      take: params.limit,
      select: { id: true }
    });

    if (ids.length === 0) {
      return 0;
    }

    const result = await this.prisma.webhookEvent.updateMany({
      where: { id: { in: ids.map((row) => row.id) } },
      data: {
        processedAt: null,
        processingError: null,
        processingStartedAt: null,
        processingWorkerId: null
      }
    });

    return result.count;
  }

  private async runWorkerOnce(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      const now = new Date();
      const staleBefore = new Date(now.getTime() - 5 * 60 * 1000);
      const claimed = await this.prisma.$transaction(async (tx) => {
        const candidates = await tx.webhookEvent.findMany({
          where: {
            processedAt: null,
            OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleBefore } }]
          },
          orderBy: { receivedAt: 'asc' },
          take: 25,
          select: { id: true }
        });

        if (candidates.length === 0) {
          return [] as Array<{ id: string; deviceUid: string | null; payload: Prisma.JsonValue }>;
        }

        const candidateIds = candidates.map((row) => row.id);
        await tx.webhookEvent.updateMany({
          where: {
            id: { in: candidateIds },
            processedAt: null,
            OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleBefore } }]
          },
          data: {
            processingStartedAt: now,
            processingWorkerId: this.workerId
          }
        });

        return tx.webhookEvent.findMany({
          where: {
            id: { in: candidateIds },
            processingWorkerId: this.workerId,
            processingStartedAt: now
          },
          select: {
            id: true,
            deviceUid: true,
            payload: true
          }
        });
      });

      for (const event of claimed) {
        await this.processEvent(event.id, event.deviceUid ?? undefined, event.payload);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  private async processEvent(
    id: string,
    deviceUid: string | undefined,
    payload: Prisma.JsonValue
  ): Promise<void> {
    const processedAt = new Date();
    try {
      const parsed = payload as TtsUplink;
      const normalized = normalizeTtsUplinkToMeasurement(parsed);
      if (!normalized.ok) {
        await this.prisma.webhookEvent.update({
          where: { id },
          data: {
            processedAt,
            processingError: normalized.reason
          }
        });
        return;
      }

      await this.measurementsService.ingestCanonical(deviceUid ?? normalized.item.deviceUid, [
        normalized.item
      ]);

      await this.prisma.webhookEvent.update({
        where: { id },
        data: {
          processedAt,
          processingError: null
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'processing_failed';
      await this.prisma.webhookEvent.update({
        where: { id },
        data: {
          processedAt,
          processingError: message
        }
      });
    }
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

function isWorkerEnabled(): boolean {
  const flag = process.env.LORAWAN_WORKER_ENABLED;
  if (flag === undefined || flag === '') {
    return true;
  }
  return flag.toLowerCase() === 'true';
}
