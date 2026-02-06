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

  async list(deviceId?: string) {
    const where = deviceId ? { deviceId } : undefined;
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
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2025'
  );
}
