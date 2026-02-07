import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';
import { RequireApiKeyScope } from '../../common/decorators/api-key-scopes.decorator';
import { ApiKeyGuard } from '../../common/guards/api-key.guard';
import { MeshtasticService } from './meshtastic.service';

@Controller('api/meshtastic')
@UseGuards(ApiKeyGuard)
@RequireApiKeyScope(ApiKeyScope.INGEST)
export class MeshtasticController {
  constructor(private readonly meshtasticService: MeshtasticService) {}

  @Post('event')
  @HttpCode(200)
  async ingest(@Body() body: unknown): Promise<{ status: string }> {
    await this.meshtasticService.ingestEvent(body);
    return { status: 'ok' };
  }
}
