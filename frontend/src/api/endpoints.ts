import { getJson, requestJson } from './http';
import type { Device, Measurement, Session, TrackPoint } from './types';

export type Bbox = {
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
};

export type MeasurementQueryParams = {
  deviceId?: string;
  sessionId?: string;
  from?: string | Date;
  to?: string | Date;
  bbox?: Bbox;
  limit?: number;
};

export type MeasurementsResponse = {
  count: number;
  limit: number;
  items: Measurement[];
};

export type TrackResponse = {
  items: TrackPoint[];
};

export type StatsResponse = {
  count: number;
  minCapturedAt: string | null;
  maxCapturedAt: string | null;
  gatewayCount: number;
};

type RequestOptions = {
  signal?: AbortSignal;
};

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function buildQuery(params: MeasurementQueryParams): string {
  const searchParams = new URLSearchParams();

  if (params.deviceId) {
    searchParams.set('deviceId', params.deviceId);
  }
  if (params.sessionId) {
    searchParams.set('sessionId', params.sessionId);
  }
  if (params.from) {
    searchParams.set('from', toIso(params.from));
  }
  if (params.to) {
    searchParams.set('to', toIso(params.to));
  }
  if (params.bbox) {
    const { minLon, minLat, maxLon, maxLat } = params.bbox;
    searchParams.set('bbox', `${minLon},${minLat},${maxLon},${maxLat}`);
  }
  if (typeof params.limit === 'number') {
    searchParams.set('limit', String(params.limit));
  }

  return searchParams.toString();
}

function buildStatsQuery(params: MeasurementQueryParams): string {
  const searchParams = new URLSearchParams();

  if (params.deviceId) {
    searchParams.set('deviceId', params.deviceId);
  }
  if (params.sessionId) {
    searchParams.set('sessionId', params.sessionId);
  }
  if (params.from) {
    searchParams.set('from', toIso(params.from));
  }
  if (params.to) {
    searchParams.set('to', toIso(params.to));
  }

  return searchParams.toString();
}

export async function listDevices(options?: RequestOptions): Promise<Device[]> {
  return getJson<Device[]>('/api/devices', options);
}

export async function listSessions(deviceId: string, options?: RequestOptions): Promise<Session[]> {
  const params = new URLSearchParams({ deviceId });
  return getJson<Session[]>(`/api/sessions?${params.toString()}`, options);
}

export async function startSession(input: { deviceId: string; name?: string }): Promise<Session> {
  return requestJson<Session>('/api/sessions/start', { method: 'POST', json: input });
}

export async function stopSession(input: { sessionId: string }): Promise<Session> {
  return requestJson<Session>('/api/sessions/stop', { method: 'POST', json: input });
}

export async function updateSession(
  id: string,
  input: { name?: string; notes?: string }
): Promise<Session> {
  return requestJson<Session>(`/api/sessions/${id}`, { method: 'PATCH', json: input });
}

export async function getMeasurements(
  params: MeasurementQueryParams,
  options?: RequestOptions
): Promise<MeasurementsResponse> {
  const query = buildQuery(params);
  const path = query ? `/api/measurements?${query}` : '/api/measurements';
  return getJson<MeasurementsResponse>(path, options);
}

export async function getTrack(params: MeasurementQueryParams, options?: RequestOptions): Promise<TrackResponse> {
  const query = buildQuery(params);
  const path = query ? `/api/tracks?${query}` : '/api/tracks';
  return getJson<TrackResponse>(path, options);
}

export async function getStats(
  params: MeasurementQueryParams,
  options?: RequestOptions
): Promise<StatsResponse> {
  const query = buildStatsQuery(params);
  const path = query ? `/api/stats?${query}` : '/api/stats';
  return getJson<StatsResponse>(path, options);
}
