import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type DeviceListItem = {
  id: string;
  deviceUid: string;
  name: string | null;
  lastSeenAt: Date | null;
  latestMeasurementAt: Date | null;
};

export type DeviceLatestStatus = {
  latestMeasurementAt: Date | null;
  latestWebhookReceivedAt: Date | null;
  latestWebhookError: string | null;
};

export type DeviceSummary = {
  id: string;
  deviceUid: string;
  name: string | null;
  lastSeenAt: Date | null;
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

  async getLatestStatus(deviceId: string, ownerId?: string): Promise<DeviceLatestStatus | null> {
    // TODO: enforce owner scoping once auth context is available.
    const device = await this.prisma.device.findFirst({
      where: ownerId ? { id: deviceId, ownerId } : { id: deviceId },
      select: { id: true, deviceUid: true }
    });

    if (!device) {
      return null;
    }

    const [latestMeasurement, latestWebhook] = await Promise.all([
      this.prisma.measurement.findFirst({
        where: { deviceId: device.id },
        orderBy: { capturedAt: 'desc' },
        select: { capturedAt: true }
      }),
      this.prisma.webhookEvent.findFirst({
        where: { deviceUid: device.deviceUid },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true, processingError: true }
      })
    ]);

    return {
      latestMeasurementAt: latestMeasurement?.capturedAt ?? null,
      latestWebhookReceivedAt: latestWebhook?.receivedAt ?? null,
      latestWebhookError: latestWebhook?.processingError ?? null
    };
  }

  async getByUid(deviceUid: string, ownerId?: string): Promise<DeviceSummary | null> {
    // TODO: enforce owner scoping once auth context is available.
    return this.prisma.device.findFirst({
      where: ownerId ? { deviceUid, ownerId } : { deviceUid },
      select: {
        id: true,
        deviceUid: true,
        name: true,
        lastSeenAt: true
      }
    });
  }
}
