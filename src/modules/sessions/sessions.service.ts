import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { StartSessionDto } from './dto/start-session.dto';
import { StopSessionDto } from './dto/stop-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';

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
    const data = {
      name: dto.name ?? undefined,
      notes: dto.notes ?? undefined
    };

    try {
      return await this.prisma.session.update({
        where: { id },
        data
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        throw new NotFoundException('Session not found');
      }
      throw error;
    }
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

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2025'
  );
}
