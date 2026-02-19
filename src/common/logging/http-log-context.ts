type MaybeRecord = Record<string, unknown> | undefined;

type RequestLike = {
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
  ownerId?: unknown;
  user?: {
    id?: unknown;
  };
};

export function extractRequestLogContext(request: RequestLike): {
  deviceId?: string;
  sessionId?: string;
  deviceUid?: string;
  userId?: string;
} {
  const params = asRecord(request.params);
  const query = asRecord(request.query);
  const body = asRecord(request.body);

  const deviceId =
    pickString(params, 'deviceId') ?? pickString(query, 'deviceId') ?? pickString(body, 'deviceId');
  const sessionId =
    pickString(params, 'sessionId') ??
    pickString(query, 'sessionId') ??
    pickString(body, 'sessionId');
  const deviceUid =
    pickString(params, 'deviceUid') ??
    pickString(query, 'deviceUid') ??
    pickString(body, 'deviceUid') ??
    extractDeviceUidFromItems(body);
  const userId = normalizeString(request.ownerId) ?? normalizeString(request.user?.id);

  return compact({
    deviceId,
    sessionId,
    deviceUid,
    userId
  });
}

function asRecord(value: unknown): MaybeRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function pickString(record: MaybeRecord, key: string): string | undefined {
  if (!record) {
    return undefined;
  }
  return normalizeString(record[key]);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function extractDeviceUidFromItems(body: MaybeRecord): string | undefined {
  if (!body) {
    return undefined;
  }
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) {
    return undefined;
  }
  const first = items[0];
  if (!first || typeof first !== 'object' || Array.isArray(first)) {
    return undefined;
  }
  const candidate = (first as Record<string, unknown>).deviceUid;
  return normalizeString(candidate);
}

function compact<T extends Record<string, unknown>>(input: T): T {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined) {
      output[key] = value;
    }
  }
  return output as T;
}
