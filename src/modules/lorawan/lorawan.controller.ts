import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { LorawanRateLimitGuard } from '../../common/guards/lorawan-rate-limit.guard';
import { LorawanWebhookGuard } from '../../common/guards/lorawan-webhook.guard';
import { LorawanService } from './lorawan.service';
import { parseTtsUplink } from './tts-uplink.schema';
import { ZodError } from 'zod';

@Controller('api/lorawan')
export class LorawanController {
  constructor(private readonly lorawanService: LorawanService) {}

  @Get('events')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async listEvents(
    @Query('deviceUid') deviceUid?: string,
    @Query('processingError') processingError?: string,
    @Query('processed') processed?: string,
    @Query('limit') limit?: string
  ) {
    const parsedLimit = parseLimit(limit);
    return this.lorawanService.listEvents({
      deviceUid: deviceUid || undefined,
      processingError: processingError || undefined,
      processed: parseOptionalBoolean(processed, 'processed'),
      limit: parsedLimit
    });
  }

  @Get('events/:id')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async getEvent(@Param('id') id: string) {
    const event = await this.lorawanService.getEventById(id);
    if (!event) {
      throw new NotFoundException('Webhook event not found');
    }
    return event;
  }

  @Post('events/:id/reprocess')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  @HttpCode(200)
  async reprocessEvent(@Param('id') id: string): Promise<{ status: string }> {
    const updated = await this.lorawanService.reprocessEvent(id);
    if (!updated) {
      throw new NotFoundException('Webhook event not found');
    }
    return { status: 'ok' };
  }

  @Post('reprocess')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  @HttpCode(200)
  async reprocessEvents(
    @Body() body: { deviceUid?: string; since?: string; processingError?: string }
  ): Promise<{ resetCount: number }> {
    const since = body?.since ? parseDate(body.since, 'since') : undefined;
    const resetCount = await this.lorawanService.reprocessEvents({
      deviceUid: body?.deviceUid,
      since,
      processingError: body?.processingError,
      limit: 500
    });
    return { resetCount };
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

    await this.lorawanService.enqueueUplink(parsed);
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

function parseOptionalBoolean(value: string | undefined, name: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new BadRequestException(`${name} must be true or false`);
}

function parseDate(value: string, name: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${name} must be a valid timestamp`);
  }
  return parsed;
}
