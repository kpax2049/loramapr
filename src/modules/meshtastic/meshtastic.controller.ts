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
import { MeshtasticService } from './meshtastic.service';

@Controller('api/meshtastic')
export class MeshtasticController {
  constructor(private readonly meshtasticService: MeshtasticService) {}

  @Post('event')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.INGEST)
  @HttpCode(200)
  async ingest(@Body() body: unknown): Promise<{ status: string }> {
    await this.meshtasticService.ingestEvent(body);
    return { status: 'ok' };
  }

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
    const items = await this.meshtasticService.listEvents({
      deviceUid: deviceUid || undefined,
      processingError: processingError || undefined,
      processed: parseOptionalBoolean(processed, 'processed'),
      limit: parsedLimit
    });
    return { items, count: items.length };
  }

  @Get('events/:id')
  @UseGuards(ApiKeyGuard)
  @RequireApiKeyScope(ApiKeyScope.QUERY)
  async getEvent(@Param('id') id: string) {
    const event = await this.meshtasticService.getEventById(id);
    if (!event) {
      throw new NotFoundException('Webhook event not found');
    }
    return event;
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
