import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type DeviceListItem = {
  id: string;
  deviceUid: string;
  name: string | null;
  lastSeenAt: Date | null;
  latestMeasurementAt: Date | null;
};

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId?: string): Promise<DeviceListItem[]> {
    // TODO: enforce owner scoping once auth context is available.
    const where = ownerId ? { ownerId } : undefined;

    const devices = await this.prisma.device.findMany({
      where,
      select: {
        id: true,
        deviceUid: true,
        name: true,
        lastSeenAt: true,
        measurements: {
          select: { capturedAt: true },
          orderBy: { capturedAt: 'desc' },
          take: 1
        }
      },
      orderBy: {
        lastSeenAt: {
          sort: 'desc',
          nulls: 'last'
        }
      }
    });

    return devices.map((device) => ({
      id: device.id,
      deviceUid: device.deviceUid,
      name: device.name,
      lastSeenAt: device.lastSeenAt,
      latestMeasurementAt: device.measurements[0]?.capturedAt ?? null
    }));
  }
}
