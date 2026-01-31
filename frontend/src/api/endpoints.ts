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

export async function listDevices(): Promise<Device[]> {
  return getJson<Device[]>('/api/devices');
}

export async function listSessions(deviceId: string): Promise<Session[]> {
  const params = new URLSearchParams({ deviceId });
  return getJson<Session[]>(`/api/sessions?${params.toString()}`);
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

export async function getMeasurements(params: MeasurementQueryParams): Promise<MeasurementsResponse> {
  const query = buildQuery(params);
  const path = query ? `/api/measurements?${query}` : '/api/measurements';
  return getJson<MeasurementsResponse>(path);
}

export async function getTrack(params: MeasurementQueryParams): Promise<TrackResponse> {
  const query = buildQuery(params);
  const path = query ? `/api/tracks?${query}` : '/api/tracks';
  return getJson<TrackResponse>(path);
}
