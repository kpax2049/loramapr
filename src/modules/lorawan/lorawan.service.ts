import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

type TtsWebhookPayload = {
  end_device_ids?: {
    device_id?: string;
    dev_eui?: string;
  };
  uplink_message?: {
    uplink_token?: string;
    f_cnt?: number;
  };
};

@Injectable()
export class LorawanService {
  constructor(private readonly prisma: PrismaService) {}

  async storeWebhook(payload: unknown): Promise<void> {
    const deviceUid = extractDeviceUid(payload);
    const uplinkId = extractUplinkId(payload, deviceUid);

    await this.prisma.webhookEvent.create({
      data: {
        source: 'tts',
        eventType: 'uplink',
        deviceUid,
        uplinkId,
        payload: payload as Prisma.InputJsonValue
      }
    });
  }
}

function extractDeviceUid(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const tts = payload as TtsWebhookPayload;
  return tts.end_device_ids?.device_id ?? tts.end_device_ids?.dev_eui ?? undefined;
}

function extractUplinkId(payload: unknown, deviceUid?: string): string | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  const tts = payload as TtsWebhookPayload;
  const uplinkToken = tts.uplink_message?.uplink_token;
  if (typeof uplinkToken === 'string' && uplinkToken.length > 0) {
    return uplinkToken;
  }
  const frameCount = tts.uplink_message?.f_cnt;
  if (typeof frameCount === 'number' && Number.isFinite(frameCount)) {
    return deviceUid ? `${deviceUid}:${frameCount}` : `f_cnt:${frameCount}`;
  }
  return undefined;
}
