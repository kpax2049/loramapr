import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class LorawanService {
  constructor(private readonly prisma: PrismaService) {}

  async storeWebhook(payload: unknown): Promise<void> {
    await this.prisma.webhookEvent.create({
      data: {
        source: 'tts',
        payload: payload as Prisma.InputJsonValue
      }
    });
  }
}
