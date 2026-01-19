import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
      throw new BadRequestException('Device not found');
    }

    return this.prisma.session.create({
      data: {
        device: {
          connect: { id: dto.deviceId }
        },
        owner: dto.ownerId ? { connect: { id: dto.ownerId } } : undefined,
        name: dto.name ?? undefined,
        notes: dto.notes ?? undefined,
        startedAt: dto.startedAt ? new Date(dto.startedAt) : new Date()
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
        endedAt: dto.endedAt ? new Date(dto.endedAt) : new Date()
      }
    });
  }

  async update(id: string, dto: UpdateSessionDto) {
    if (dto.deviceId) {
      const device = await this.prisma.device.findUnique({
        where: { id: dto.deviceId },
        select: { id: true }
      });
      if (!device) {
        throw new BadRequestException('Device not found');
      }
    }

    const ownerUpdate =
      dto.ownerId === null
        ? { disconnect: true }
        : dto.ownerId
        ? { connect: { id: dto.ownerId } }
        : undefined;

    const data: Prisma.SessionUpdateInput = {
      device: dto.deviceId ? { connect: { id: dto.deviceId } } : undefined,
      owner: ownerUpdate,
      name: dto.name ?? undefined,
      notes: dto.notes ?? undefined,
      startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
      endedAt: dto.endedAt ? new Date(dto.endedAt) : undefined
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
