import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { MeasurementIngestDto } from './dto/measurement-ingest.dto';

export type MeasurementIngestResult = {
  measurementCount: number;
  measurementIds: string[];
  deviceCount: number;
  deviceIds: string[];
};

type PreparedMeasurement = MeasurementIngestDto & { capturedAtDate: Date };

@Injectable()
export class MeasurementsService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(measurements: MeasurementIngestDto[]): Promise<MeasurementIngestResult> {
    if (measurements.length === 0) {
      return { measurementCount: 0, measurementIds: [], deviceCount: 0, deviceIds: [] };
    }

    const prepared = measurements.map((measurement) => ({
      ...measurement,
      capturedAtDate: new Date(measurement.capturedAt)
    }));

    const lastSeenByDevice = new Map<string, Date>();
    for (const measurement of prepared) {
      const existing = lastSeenByDevice.get(measurement.deviceUid);
      if (!existing || measurement.capturedAtDate > existing) {
        lastSeenByDevice.set(measurement.deviceUid, measurement.capturedAtDate);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const deviceIdByUid = new Map<string, string>();
      const deviceIds: string[] = [];

      for (const [deviceUid, lastSeenAt] of lastSeenByDevice.entries()) {
        const existing = await tx.device.findUnique({
          where: { deviceUid },
          select: { id: true, lastSeenAt: true }
        });

        if (!existing) {
          const created = await tx.device.create({
            data: {
              deviceUid,
              lastSeenAt
            },
            select: { id: true }
          });
          deviceIdByUid.set(deviceUid, created.id);
          deviceIds.push(created.id);
          continue;
        }

        deviceIdByUid.set(deviceUid, existing.id);
        deviceIds.push(existing.id);

        if (!existing.lastSeenAt || lastSeenAt > existing.lastSeenAt) {
          await tx.device.update({
            where: { id: existing.id },
            data: { lastSeenAt }
          });
        }
      }

      const measurementIds: string[] = [];
      for (const measurement of prepared) {
        const deviceId = deviceIdByUid.get(measurement.deviceUid);
        if (!deviceId) {
          throw new Error(`Device lookup failed for ${measurement.deviceUid}`);
        }

        const created = await tx.measurement.create({
          data: {
            deviceId,
            capturedAt: measurement.capturedAtDate,
            lat: measurement.lat,
            lon: measurement.lon,
            alt: measurement.alt,
            hdop: measurement.hdop,
            rssi: measurement.rssi,
            snr: measurement.snr,
            sf: measurement.sf,
            bw: measurement.bw,
            freq: measurement.freq,
            gatewayId: measurement.gatewayId,
            payloadRaw: measurement.payloadRaw
          },
          select: { id: true }
        });
        measurementIds.push(created.id);
      }

      return {
        measurementCount: measurementIds.length,
        measurementIds,
        deviceCount: deviceIds.length,
        deviceIds
      };
    });
  }
}
