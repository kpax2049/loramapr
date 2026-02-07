import { Controller, Get, NotFoundException, Param, Req, UseGuards } from '@nestjs/common';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { getOwnerIdFromRequest, OwnerContextRequest } from '../../common/owner-context';
import { DeviceLatestStatus, DeviceListItem, DeviceSummary, DevicesService } from './devices.service';

@Controller('api/devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @UseGuards(OwnerGuard)
  async list(
    @Req() request: OwnerContextRequest
  ): Promise<{ items: DeviceListItem[]; count: number }> {
    const ownerId = getOwnerIdFromRequest(request);
    const items = await this.devicesService.list(ownerId);
    return { items, count: items.length };
  }

  @Get(':id/latest')
  @UseGuards(OwnerGuard)
  async latest(
    @Req() request: OwnerContextRequest,
    @Param('id') id: string
  ): Promise<{
    latestMeasurementAt: string | null;
    latestWebhookReceivedAt: string | null;
    latestWebhookError: string | null;
    latestWebhookSource: string | null;
  }> {
    const ownerId = getOwnerIdFromRequest(request);
    const latest = await this.devicesService.getLatestStatus(id, ownerId);
    if (!latest) {
      throw new NotFoundException('Device not found');
    }
    return formatLatestResponse(latest);
  }

  @Get('by-uid/:deviceUid')
  @UseGuards(OwnerGuard)
  async getByUid(
    @Req() request: OwnerContextRequest,
    @Param('deviceUid') deviceUid: string
  ): Promise<DeviceSummary> {
    const ownerId = getOwnerIdFromRequest(request);
    const device = await this.devicesService.getByUid(deviceUid, ownerId);
    if (!device) {
      throw new NotFoundException('Device not found');
    }
    return device;
  }
}

function formatLatestResponse(latest: DeviceLatestStatus) {
  return {
    latestMeasurementAt: latest.latestMeasurementAt ? latest.latestMeasurementAt.toISOString() : null,
    latestWebhookReceivedAt: latest.latestWebhookReceivedAt
      ? latest.latestWebhookReceivedAt.toISOString()
      : null,
    latestWebhookError: latest.latestWebhookError ?? null,
    latestWebhookSource: latest.latestWebhookSource ?? null
  };
}
