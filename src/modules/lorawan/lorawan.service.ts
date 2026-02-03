import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
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

  private async runWorkerOnce(): Promise<void> {
    if (this.isProcessing) {
      return;
    }
    this.isProcessing = true;
    try {
      const batch = await this.prisma.webhookEvent.findMany({
        where: { processedAt: null },
        orderBy: { receivedAt: 'asc' },
        take: 25,
        select: {
          id: true,
          deviceUid: true,
          payload: true
        }
      });

      for (const event of batch) {
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
