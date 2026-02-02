import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { LorawanRateLimitGuard } from '../../common/guards/lorawan-rate-limit.guard';
import { LorawanWebhookGuard } from '../../common/guards/lorawan-webhook.guard';
import { LorawanService } from './lorawan.service';
import { parseTtsUplink } from './tts-uplink.schema';
import { ZodError } from 'zod';

@Controller('api/lorawan')
export class LorawanController {
  constructor(private readonly lorawanService: LorawanService) {}

  @Get('events')
  async listEvents(
    @Query('deviceUid') deviceUid?: string,
    @Query('limit') limit?: string
  ) {
    const parsedLimit = parseLimit(limit);
    return this.lorawanService.listEvents({
      deviceUid: deviceUid || undefined,
      limit: parsedLimit
    });
  }

  @Post('uplink')
  @UseGuards(LorawanRateLimitGuard, LorawanWebhookGuard)
  @HttpCode(200)
  async uplink(@Body() body: unknown): Promise<{ status: string }> {
    let parsed;
    try {
      parsed = parseTtsUplink(body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException('Invalid TTS uplink payload');
      }
      throw error;
    }

    await this.lorawanService.handleUplink(parsed);
    return { status: 'ok' };
  }
}

function parseLimit(value?: string): number {
  if (!value) {
    return 50;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException('limit must be a positive integer');
  }
  return Math.min(parsed, 200);
}
