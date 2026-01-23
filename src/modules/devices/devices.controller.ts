import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { OwnerGuard } from '../../common/guards/owner.guard';
import { getOwnerIdFromRequest, OwnerContextRequest } from '../../common/owner-context';
import { DeviceListItem, DevicesService } from './devices.service';

@Controller('api/devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  @UseGuards(OwnerGuard)
  async list(@Req() request: OwnerContextRequest): Promise<DeviceListItem[]> {
    const ownerId = getOwnerIdFromRequest(request);
    return this.devicesService.list(ownerId);
  }
}
