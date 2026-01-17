import { Controller, Get } from '@nestjs/common';
import { DeviceListItem, DevicesService } from './devices.service';

@Controller('api/devices')
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Get()
  async list(): Promise<DeviceListItem[]> {
    return this.devicesService.list();
  }
}
