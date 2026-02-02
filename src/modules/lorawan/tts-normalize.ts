import type { TtsUplink } from './tts-uplink.schema';

type NormalizedMeasurement = {
  deviceUid: string;
  capturedAt: string;
  lat: number;
  lon: number;
  alt?: number;
  hdop?: number;
  rssi?: number;
  snr?: number;
  sf?: number;
  bw?: number;
  freq?: number;
  gatewayId?: string;
  payloadRaw: {
    received_at: string;
    correlation_ids?: string[];
    end_device_ids?: TtsUplink['end_device_ids'];
    uplink_message?: TtsUplink['uplink_message'];
  };
};

export type NormalizeResult =
  | { ok: true; item: NormalizedMeasurement }
  | { ok: false; reason: string };

type RxMetadata = NonNullable<NonNullable<TtsUplink['uplink_message']>['rx_metadata']>[number];

export function normalizeTtsUplinkToMeasurement(parsedPayload: TtsUplink): NormalizeResult {
  const deviceUid =
    parsedPayload.end_device_ids?.dev_eui ?? parsedPayload.end_device_ids?.device_id ?? undefined;
  if (!deviceUid) {
    return { ok: false, reason: 'missing_device_uid' };
  }

  const capturedAt = parsedPayload.received_at;

  const decoded = parsedPayload.uplink_message?.decoded_payload;
  const gps = decoded && typeof decoded === 'object' && 'gps' in decoded ? (decoded as { gps?: unknown }).gps : undefined;

  const latLon =
    pickLatLon(decoded, 'lat', 'lon') ??
    pickLatLon(decoded, 'latitude', 'longitude') ??
    pickLatLon(gps, 'lat', 'lon') ??
    pickLatLon(gps, 'latitude', 'longitude');

  if (!latLon) {
    return { ok: false, reason: 'missing_gps' };
  }

  const { lat, lon } = latLon;
  const alt =
    pickNumber(decoded, 'alt') ??
    pickNumber(decoded, 'altitude') ??
    pickNumber(gps, 'alt') ??
    pickNumber(gps, 'altitude');
  const hdop = pickNumber(decoded, 'hdop') ?? pickNumber(gps, 'hdop');

  const { gatewayId, rssi, snr } = pickGateway(parsedPayload.uplink_message?.rx_metadata);

  const lora = parsedPayload.uplink_message?.settings?.data_rate?.lora;
  const sf = typeof lora?.spreading_factor === 'number' ? lora.spreading_factor : undefined;
  const bw = typeof lora?.bandwidth === 'number' ? lora.bandwidth : undefined;
  const freq = toNumber(parsedPayload.uplink_message?.settings?.frequency);

  const payloadRaw = {
    received_at: parsedPayload.received_at,
    correlation_ids: parsedPayload.correlation_ids,
    end_device_ids: parsedPayload.end_device_ids,
    uplink_message: parsedPayload.uplink_message
  };

  return {
    ok: true,
    item: {
      deviceUid,
      capturedAt,
      lat,
      lon,
      alt: alt ?? undefined,
      hdop: hdop ?? undefined,
      rssi: typeof rssi === 'number' ? rssi : undefined,
      snr: typeof snr === 'number' ? snr : undefined,
      sf,
      bw,
      freq: typeof freq === 'number' ? freq : undefined,
      gatewayId,
      payloadRaw
    }
  };
}

function pickLatLon(
  source: unknown,
  latKey: 'lat' | 'latitude',
  lonKey: 'lon' | 'longitude'
): { lat: number; lon: number } | null {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const record = source as Record<string, unknown>;
  const lat = toNumber(record[latKey]);
  const lon = toNumber(record[lonKey]);
  if (typeof lat === 'number' && typeof lon === 'number') {
    return { lat, lon };
  }
  return null;
}

function pickNumber(source: unknown, key: string): number | null {
  if (!source || typeof source !== 'object') {
    return null;
  }
  const record = source as Record<string, unknown>;
  return toNumber(record[key]);
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

function pickGateway(rxMetadata?: RxMetadata[]): {
  gatewayId?: string;
  rssi?: number;
  snr?: number;
} {
  if (!Array.isArray(rxMetadata) || rxMetadata.length === 0) {
    return {};
  }

  const sorted = [...rxMetadata].sort((a, b) => {
    const snrA = typeof a?.snr === 'number' ? a.snr : -Infinity;
    const snrB = typeof b?.snr === 'number' ? b.snr : -Infinity;
    if (snrA !== snrB) {
      return snrB - snrA;
    }
    const rssiA = typeof a?.rssi === 'number' ? a.rssi : -Infinity;
    const rssiB = typeof b?.rssi === 'number' ? b.rssi : -Infinity;
    return rssiB - rssiA;
  });

  const best = sorted[0];
  return {
    gatewayId: best?.gateway_ids?.gateway_id,
    rssi: typeof best?.rssi === 'number' ? best.rssi : undefined,
    snr: typeof best?.snr === 'number' ? best.snr : undefined
  };
}
