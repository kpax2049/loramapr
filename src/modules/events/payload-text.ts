const MAX_JSON_LENGTH = 20_000;
const MAX_PAYLOAD_TEXT_LENGTH = 24_000;

export function buildWebhookPayloadText(input: {
  deviceUid?: string | null;
  portnum?: string | null;
  packetId?: string | null;
  payload: unknown;
}): string {
  const parts: string[] = [];

  pushTagged(parts, 'deviceUid', toNonEmptyString(input.deviceUid));
  pushTagged(parts, 'portnum', toNonEmptyString(input.portnum));
  pushTagged(parts, 'packetId', toNonEmptyString(input.packetId));

  const payloadRecord = toRecord(input.payload);
  if (payloadRecord) {
    const decoded = toRecord(payloadRecord.decoded);
    const user = toRecord(decoded?.user) ?? toRecord(payloadRecord.user);
    const telemetry = toRecord(decoded?.telemetry) ?? toRecord(payloadRecord.telemetry);
    const deviceMetrics = toRecord(telemetry?.deviceMetrics) ?? toRecord(telemetry?.device_metrics);

    pushTagged(parts, 'fromId', firstString(payloadRecord, ['fromId', 'from_id', 'from']));
    pushTagged(parts, 'toId', firstString(payloadRecord, ['toId', 'to_id', 'to']));
    pushTagged(parts, 'decodedPortnum', firstString(decoded, ['portnum']));
    pushTagged(parts, 'longName', firstString(user, ['longName', 'long_name']));
    pushTagged(parts, 'shortName', firstString(user, ['shortName', 'short_name']));
    pushTagged(parts, 'hwModel', firstString(user, ['hwModel', 'hardwareModel', 'hw_model']));

    if (deviceMetrics) {
      const metricKeys = Object.keys(deviceMetrics).slice(0, 40);
      if (metricKeys.length > 0) {
        parts.push(`telemetryKeys:${metricKeys.join(',')}`);
      }
    }
  }

  const compactJson = toBoundedJson(input.payload);
  if (compactJson) {
    parts.push(compactJson);
  }

  const merged = parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
    .join(' ');

  if (merged.length <= MAX_PAYLOAD_TEXT_LENGTH) {
    return merged;
  }

  return merged.slice(0, MAX_PAYLOAD_TEXT_LENGTH);
}

function pushTagged(parts: string[], tag: string, value: string | null): void {
  if (!value) {
    return;
  }
  parts.push(`${tag}:${value}`);
}

function toBoundedJson(payload: unknown): string {
  let serialized: string;
  try {
    serialized = JSON.stringify(payload, (_key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    );
  } catch {
    serialized = String(payload);
  }

  if (serialized.length <= MAX_JSON_LENGTH) {
    return serialized;
  }

  return serialized.slice(0, MAX_JSON_LENGTH);
}

function firstString(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = toNonEmptyString(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}
