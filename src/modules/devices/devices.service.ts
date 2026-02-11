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
  latestWebhookSource: string | null;
};

export type DeviceSummary = {
  id: string;
  deviceUid: string;
  name: string | null;
  lastSeenAt: Date | null;
};

export type DeviceAutoSessionConfigResult = {
  deviceId: string;
  enabled: boolean;
  homeLat: number | null;
  homeLon: number | null;
  radiusMeters: number | null;
  minOutsideSeconds: number | null;
  minInsideSeconds: number | null;
  updatedAt: Date | null;
};

export type DeviceLatestPosition = {
  deviceId: string;
  capturedAt: Date | null;
  lat: number | null;
  lon: number | null;
};

export type AgentAutoSessionConfig = {
  deviceUid: string;
  deviceId: string;
  enabled: boolean;
  homeLat: number | null;
  homeLon: number | null;
  radiusMeters: number | null;
  minOutsideSeconds: number;
  minInsideSeconds: number;
};

const DEFAULT_RADIUS_METERS = 20;
const DEFAULT_MIN_OUTSIDE_SECONDS = 30;
const DEFAULT_MIN_INSIDE_SECONDS = 120;

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
        select: { receivedAt: true, processingError: true, source: true }
      })
    ]);

    return {
      latestMeasurementAt: latestMeasurement?.capturedAt ?? null,
      latestWebhookReceivedAt: latestWebhook?.receivedAt ?? null,
      latestWebhookError: latestWebhook?.processingError ?? null,
      latestWebhookSource: normalizeWebhookSource(latestWebhook?.source)
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

  async getAutoSessionConfig(deviceId: string): Promise<DeviceAutoSessionConfigResult | null> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true }
    });
    if (!device) {
      return null;
    }

    const config = await this.prisma.deviceAutoSessionConfig.findUnique({
      where: { deviceId },
      select: {
        deviceId: true,
        enabled: true,
        homeLat: true,
        homeLon: true,
        radiusMeters: true,
        minOutsideSeconds: true,
        minInsideSeconds: true,
        updatedAt: true
      }
    });

    if (!config) {
      return {
        deviceId,
        enabled: false,
        homeLat: null,
        homeLon: null,
        radiusMeters: null,
        minOutsideSeconds: null,
        minInsideSeconds: null,
        updatedAt: null
      };
    }

    return config;
  }

  async upsertAutoSessionConfig(
    deviceId: string,
    data: {
      enabled: boolean;
      homeLat: number | null;
      homeLon: number | null;
      radiusMeters: number;
      minOutsideSeconds: number;
      minInsideSeconds: number;
    }
  ): Promise<DeviceAutoSessionConfigResult | null> {
    const device = await this.prisma.device.findUnique({
      where: { id: deviceId },
      select: { id: true }
    });
    if (!device) {
      return null;
    }

    return this.prisma.deviceAutoSessionConfig.upsert({
      where: { deviceId },
      update: {
        enabled: data.enabled,
        homeLat: data.homeLat,
        homeLon: data.homeLon,
        radiusMeters: data.radiusMeters,
        minOutsideSeconds: data.minOutsideSeconds,
        minInsideSeconds: data.minInsideSeconds
      },
      create: {
        deviceId,
        enabled: data.enabled,
        homeLat: data.homeLat,
        homeLon: data.homeLon,
        radiusMeters: data.radiusMeters,
        minOutsideSeconds: data.minOutsideSeconds,
        minInsideSeconds: data.minInsideSeconds
      },
      select: {
        deviceId: true,
        enabled: true,
        homeLat: true,
        homeLon: true,
        radiusMeters: true,
        minOutsideSeconds: true,
        minInsideSeconds: true,
        updatedAt: true
      }
    });
  }

  async getLatestPositionByUid(deviceUid: string): Promise<DeviceLatestPosition | null> {
    const device = await this.prisma.device.findUnique({
      where: { deviceUid },
      select: { id: true }
    });
    if (!device) {
      return null;
    }

    const latest = await this.prisma.measurement.findFirst({
      where: { deviceId: device.id },
      orderBy: { capturedAt: 'desc' },
      select: { capturedAt: true, lat: true, lon: true }
    });

    return {
      deviceId: device.id,
      capturedAt: latest?.capturedAt ?? null,
      lat: latest?.lat ?? null,
      lon: latest?.lon ?? null
    };
  }

  async getAgentAutoSessionConfigByUid(deviceUid: string): Promise<AgentAutoSessionConfig | null> {
    const device = await this.prisma.device.findUnique({
      where: { deviceUid },
      select: { id: true, deviceUid: true }
    });
    if (!device) {
      return null;
    }

    const config = await this.prisma.deviceAutoSessionConfig.findUnique({
      where: { deviceId: device.id },
      select: {
        enabled: true,
        homeLat: true,
        homeLon: true,
        radiusMeters: true,
        minOutsideSeconds: true,
        minInsideSeconds: true
      }
    });

    const enabled = config?.enabled ?? false;
    return {
      deviceUid: device.deviceUid,
      deviceId: device.id,
      enabled,
      homeLat: config?.homeLat ?? null,
      homeLon: config?.homeLon ?? null,
      radiusMeters: config?.radiusMeters ?? (enabled ? DEFAULT_RADIUS_METERS : null),
      minOutsideSeconds: config?.minOutsideSeconds ?? DEFAULT_MIN_OUTSIDE_SECONDS,
      minInsideSeconds: config?.minInsideSeconds ?? DEFAULT_MIN_INSIDE_SECONDS
    };
  }
}

function normalizeWebhookSource(source?: string | null): string | null {
  if (!source) {
    return null;
  }
  if (source === 'tts') {
    return 'lorawan';
  }
  return source;
}
