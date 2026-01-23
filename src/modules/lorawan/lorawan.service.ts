import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MeasurementIngestDto } from '../measurements/dto/measurement-ingest.dto';
import { MeasurementsService } from '../measurements/measurements.service';

@Injectable()
export class LorawanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly measurementsService: MeasurementsService
  ) {}

  async storeUplink(payload: unknown): Promise<void> {
    await this.prisma.lorawanUplink.create({
      data: {
        payloadRaw: payload as Prisma.InputJsonValue
      }
    });
  }

  async handleUplink(payload: unknown): Promise<void> {
    await this.storeUplink(payload);

    const measurement = decodeUplink(payload);
    if (!measurement) {
      return;
    }

    await this.measurementsService.ingest([measurement]);
  }
}

type TtsUplink = {
  received_at?: string;
  end_device_ids?: {
    device_id?: string;
    dev_eui?: string;
  };
  uplink_message?: {
    received_at?: string;
    frm_payload?: string;
    rx_metadata?: Array<{
      rssi?: number;
      snr?: number;
      time?: string;
      gateway_ids?: { gateway_id?: string };
      location?: {
        latitude?: number;
        longitude?: number;
        altitude?: number;
      };
    }>;
    settings?: {
      data_rate?: {
        lora?: {
          spreading_factor?: number;
          bandwidth?: number;
        };
      };
    };
    location?: {
      latitude?: number;
      longitude?: number;
      altitude?: number;
    };
    locations?: Record<
      string,
      {
        latitude?: number;
        longitude?: number;
        altitude?: number;
      }
    >;
  };
};

type LocationSelection = {
  lat: number;
  lon: number;
  alt?: number;
  metadata?: NonNullable<TtsUplink['uplink_message']>['rx_metadata'] extends Array<infer T> ? T : never;
};

function decodeUplink(payload: unknown): MeasurementIngestDto | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const uplink = payload as TtsUplink;
  const deviceUid =
    uplink.end_device_ids?.device_id ?? uplink.end_device_ids?.dev_eui ?? undefined;
  if (!deviceUid) {
    return null;
  }

  const capturedAt = pickCapturedAt(uplink);
  if (!capturedAt) {
    return null;
  }

  const location = pickLocation(uplink);
  if (!location) {
    return null;
  }

  const measurement: MeasurementIngestDto = {
    deviceUid,
    capturedAt,
    lat: location.lat,
    lon: location.lon
  };

  if (typeof location.alt === 'number') {
    measurement.alt = location.alt;
  }

  const radio = pickRadio(uplink, location.metadata);
  if (typeof radio.rssi === 'number') {
    measurement.rssi = Math.round(radio.rssi);
  }
  if (typeof radio.snr === 'number') {
    measurement.snr = radio.snr;
  }
  if (typeof radio.sf === 'number') {
    measurement.sf = radio.sf;
  }
  if (typeof radio.gatewayId === 'string') {
    measurement.gatewayId = radio.gatewayId;
  }

  const payloadRaw = uplink.uplink_message?.frm_payload;
  if (typeof payloadRaw === 'string') {
    measurement.payloadRaw = payloadRaw;
  }

  return measurement;
}

function pickCapturedAt(uplink: TtsUplink): string | null {
  const candidates = [
    uplink.uplink_message?.received_at,
    uplink.received_at,
    uplink.uplink_message?.rx_metadata?.[0]?.time
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    const parsed = new Date(candidate);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return null;
}

function pickLocation(uplink: TtsUplink): LocationSelection | null {
  const rxMetadata = uplink.uplink_message?.rx_metadata ?? [];
  for (const metadata of rxMetadata) {
    const location = metadata.location;
    const lat = toNumber(location?.latitude);
    const lon = toNumber(location?.longitude);
    if (lat !== null && lon !== null) {
      return {
        lat,
        lon,
        alt: toNumber(location?.altitude) ?? undefined,
        metadata
      };
    }
  }

  const messageLocation = uplink.uplink_message?.location;
  const fallbackLat = toNumber(messageLocation?.latitude);
  const fallbackLon = toNumber(messageLocation?.longitude);
  if (fallbackLat !== null && fallbackLon !== null) {
    return {
      lat: fallbackLat,
      lon: fallbackLon,
      alt: toNumber(messageLocation?.altitude) ?? undefined
    };
  }

  const locations = uplink.uplink_message?.locations;
  if (locations) {
    for (const location of Object.values(locations)) {
      const lat = toNumber(location?.latitude);
      const lon = toNumber(location?.longitude);
      if (lat !== null && lon !== null) {
        return {
          lat,
          lon,
          alt: toNumber(location?.altitude) ?? undefined
        };
      }
    }
  }

  return null;
}

function pickRadio(
  uplink: TtsUplink,
  metadata?: LocationSelection['metadata']
): {
  rssi?: number;
  snr?: number;
  sf?: number;
  gatewayId?: string;
} {
  const rxMetadata = uplink.uplink_message?.rx_metadata ?? [];
  const candidate = metadata ?? rxMetadata[0];

  const rssi = toNumber(candidate?.rssi);
  const snr = toNumber(candidate?.snr);
  const gatewayId = candidate?.gateway_ids?.gateway_id;

  const sf = uplink.uplink_message?.settings?.data_rate?.lora?.spreading_factor;

  return {
    rssi: rssi ?? undefined,
    snr: snr ?? undefined,
    sf,
    gatewayId
  };
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}
