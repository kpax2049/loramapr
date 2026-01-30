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
}

function isNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2025'
  );
}
