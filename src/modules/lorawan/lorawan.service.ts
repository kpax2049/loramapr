import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LorawanService {
  constructor(private readonly prisma: PrismaService) {}

  async storeUplink(payload: unknown): Promise<void> {
    await this.prisma.lorawanUplink.create({
      data: {
        payloadRaw: payload as Prisma.InputJsonValue
      }
    });
  }
}
