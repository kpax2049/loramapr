import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MeasurementsService } from '../measurements/measurements.service';
import { normalizeTtsUplinkToMeasurement } from './tts-normalize';
import type { TtsUplink } from './tts-uplink.schema';
import { deriveUplinkId } from './uplink-id';

@Injectable()
export class LorawanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly measurementsService: MeasurementsService
  ) {}

  async handleUplink(parsed: TtsUplink): Promise<void> {
    const deviceUid =
      parsed.end_device_ids?.dev_eui ?? parsed.end_device_ids?.device_id ?? undefined;
    const uplinkId = deriveUplinkId(parsed);

    let webhookEventId: string | null = null;

    try {
      const created = await this.prisma.webhookEvent.create({
        data: {
          source: 'tts',
          eventType: 'uplink',
          deviceUid,
          uplinkId,
          payload: parsed as Prisma.InputJsonValue
        },
        select: { id: true }
      });
      webhookEventId = created.id;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return;
      }
      throw error;
    }

    const normalized = normalizeTtsUplinkToMeasurement(parsed);
    if (!normalized.ok) {
      await this.prisma.webhookEvent.update({
        where: { id: webhookEventId },
        data: {
          processedAt: new Date(),
          processingError: normalized.reason
        }
      });
      return;
    }

    await this.measurementsService.ingestCanonical(deviceUid ?? normalized.item.deviceUid, [
      normalized.item
    ]);

    await this.prisma.webhookEvent.update({
      where: { id: webhookEventId },
      data: {
        processedAt: new Date(),
        processingError: null
      }
    });
  }

  async listEvents(params: { deviceUid?: string; limit: number }) {
    const where = params.deviceUid ? { deviceUid: params.deviceUid } : undefined;
    return this.prisma.webhookEvent.findMany({
      where,
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
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}
