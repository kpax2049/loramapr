import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { LorawanWebhookGuard } from '../../common/guards/lorawan-webhook.guard';
import { LorawanService } from './lorawan.service';

@Controller('api/lorawan')
export class LorawanController {
  constructor(private readonly lorawanService: LorawanService) {}

  @Post('uplink')
  @UseGuards(LorawanWebhookGuard)
  @HttpCode(200)
  async uplink(@Body() body: unknown): Promise<{ status: string }> {
    await this.lorawanService.storeUplink(body);
    return { status: 'ok' };
  }
}
