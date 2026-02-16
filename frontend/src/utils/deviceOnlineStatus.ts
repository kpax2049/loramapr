export type DeviceStatusBucket = 'online' | 'recent' | 'stale' | 'offline' | 'unknown';

export type DeviceStatusThresholds = {
  onlineMs: number;
  recentMs: number;
  staleMs: number;
};

export type DeviceOnlineStatusInput = {
  latestMeasurementAt?: string | null;
  latestWebhookReceivedAt?: string | null;
};

const DEFAULT_ONLINE_MS = 2 * 60_000;
const DEFAULT_RECENT_MS = 15 * 60_000;
const DEFAULT_STALE_MS = 2 * 60 * 60_000;

function parseDurationMs(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value.trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.floor(parsed);
}

function normalizeThresholds(input: DeviceStatusThresholds): DeviceStatusThresholds {
  const onlineMs = input.onlineMs;
  const recentMs = Math.max(input.recentMs, onlineMs);
  const staleMs = Math.max(input.staleMs, recentMs);
  return { onlineMs, recentMs, staleMs };
}

export function getDeviceStatusThresholds(): DeviceStatusThresholds {
  const onlineMs = parseDurationMs(import.meta.env.VITE_ONLINE_MS, DEFAULT_ONLINE_MS);
  const recentMs = parseDurationMs(import.meta.env.VITE_RECENT_MS, DEFAULT_RECENT_MS);
  const staleMs = parseDurationMs(import.meta.env.VITE_STALE_MS, DEFAULT_STALE_MS);

  return normalizeThresholds({ onlineMs, recentMs, staleMs });
}

export const DEVICE_STATUS_THRESHOLDS = getDeviceStatusThresholds();

export function getTimestampStatus(
  timestamp: string | null | undefined,
  options?: {
    nowMs?: number;
    thresholds?: DeviceStatusThresholds;
  }
): DeviceStatusBucket {
  if (!timestamp) {
    return 'unknown';
  }

  const parsedMs = new Date(timestamp).getTime();
  if (!Number.isFinite(parsedMs)) {
    return 'unknown';
  }

  const nowMs = options?.nowMs ?? Date.now();
  const ageMs = Math.max(0, nowMs - parsedMs);
  const thresholds = options?.thresholds ?? DEVICE_STATUS_THRESHOLDS;

  if (ageMs > thresholds.staleMs) {
    return 'offline';
  }
  if (ageMs > thresholds.recentMs) {
    return 'stale';
  }
  if (ageMs > thresholds.onlineMs) {
    return 'recent';
  }
  return 'online';
}

export function getDeviceOnlineStatuses(
  input: DeviceOnlineStatusInput,
  options?: {
    nowMs?: number;
    thresholds?: DeviceStatusThresholds;
  }
): {
  measurementStatus: DeviceStatusBucket;
  webhookStatus: DeviceStatusBucket;
} {
  return {
    measurementStatus: getTimestampStatus(input.latestMeasurementAt, options),
    webhookStatus: getTimestampStatus(input.latestWebhookReceivedAt, options)
  };
}
