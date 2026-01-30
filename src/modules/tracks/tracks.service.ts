import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type TrackQueryParams = {
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

export type TrackResult = {
  items: Array<{
    capturedAt: Date;
    lat: number;
    lon: number;
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
    if (params.ownerId) {
      // TODO: confirm owner scoping logic once auth exists.
      where.device = { ownerId: params.ownerId };
    }

    const items = await this.prisma.measurement.findMany({
      where,
      orderBy: { capturedAt: 'asc' },
      take: params.limit,
      select: {
        capturedAt: true,
        lat: true,
        lon: true
      }
    });

    return {
      items
    };
  }
}
