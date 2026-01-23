import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type TrackQueryParams = {
  deviceId?: string;
  sessionId?: string;
  ownerId?: string;
};

export type TrackResult = {
  count: number;
  items: Array<{
    id: string;
    deviceId: string;
    sessionId: string | null;
    capturedAt: Date;
    lat: number;
    lon: number;
    alt: number | null;
    hdop: number | null;
    rssi: number | null;
    snr: number | null;
    sf: number | null;
    bw: number | null;
    freq: number | null;
    gatewayId: string | null;
    payloadRaw: string | null;
    ingestedAt: Date;
  }>;
};

@Injectable()
export class TracksService {
  constructor(private readonly prisma: PrismaService) {}

  async getTrack(params: TrackQueryParams): Promise<TrackResult> {
    const where: Record<string, unknown> = {};
    if (params.deviceId) {
      where.deviceId = params.deviceId;
    }
    if (params.sessionId) {
      where.sessionId = params.sessionId;
    }
    if (params.ownerId) {
      // TODO: confirm owner scoping logic once auth exists.
      where.device = { ownerId: params.ownerId };
    }

    const items = await this.prisma.measurement.findMany({
      where,
      orderBy: { capturedAt: 'asc' }
    });

    return {
      count: items.length,
      items
    };
  }
}
