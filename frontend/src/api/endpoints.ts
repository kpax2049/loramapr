import { getJson, requestJson } from './http';
import type {
  Device,
  DeviceDetail,
  DeviceMutable,
  DeviceLatest,
  CoverageBinsResponse,
  GatewayStats,
  GatewaySummary,
  ListResponse,
  LorawanEvent,
  LorawanEventDetail,
  LorawanSummary,
  Measurement,
  AutoSessionConfig,
  AgentDecision,
  ReceiverSummary,
  MeshtasticEvent,
  MeshtasticEventDetail,
  SessionWindowResponse,
  SessionTimeline,
  Session,
  TrackPoint
} from './types';

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
  gatewayId?: string;
  receiverId?: string;
  rxGatewayId?: string;
  sample?: number;
  limit?: number;
};

export type MeasurementsResponse = {
  count: number;
  limit: number;
  items: Measurement[];
};

export type TrackResponse = {
  count: number;
  items: TrackPoint[];
  totalBeforeSample: number;
  returnedAfterSample: number;
};

export type SessionWindowParams = {
  sessionId: string;
  cursor: string | Date;
  windowMs: number;
  limit?: number;
  sample?: number;
};

export type StatsResponse = {
  count: number;
  minCapturedAt: string | null;
  maxCapturedAt: string | null;
  gatewayCount: number;
};

export type CoverageQueryParams = {
  deviceId?: string;
  sessionId?: string;
  day?: string;
  bbox?: [number, number, number, number];
  gatewayId?: string;
  limit?: number;
};

export type GatewayQueryParams = {
  deviceId?: string;
  sessionId?: string;
  from?: string | Date;
  to?: string | Date;
};

export type ReceiversQueryParams = {
  source?: 'lorawan' | 'meshtastic' | 'any';
  deviceId?: string;
  sessionId?: string;
  from?: string | Date;
  to?: string | Date;
};

type RequestOptions = {
  signal?: AbortSignal;
  headers?: HeadersInit;
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
  if (params.gatewayId) {
    searchParams.set('gatewayId', params.gatewayId);
  }
  if (params.receiverId) {
    searchParams.set('receiverId', params.receiverId);
  }
  if (params.rxGatewayId) {
    searchParams.set('rxGatewayId', params.rxGatewayId);
  }
  if (typeof params.sample === 'number') {
    searchParams.set('sample', String(params.sample));
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

function buildCoverageQuery(params: CoverageQueryParams): string {
  const searchParams = new URLSearchParams();

  if (params.deviceId) {
    searchParams.set('deviceId', params.deviceId);
  }
  if (params.sessionId) {
    searchParams.set('sessionId', params.sessionId);
  }
  if (params.day) {
    searchParams.set('day', params.day);
  }
  if (params.bbox) {
    searchParams.set('bbox', params.bbox.join(','));
  }
  if (params.gatewayId) {
    searchParams.set('gatewayId', params.gatewayId);
  }
  if (typeof params.limit === 'number') {
    searchParams.set('limit', String(params.limit));
  }

  return searchParams.toString();
}

function buildGatewayQuery(params: GatewayQueryParams): string {
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

function buildReceiversQuery(params: ReceiversQueryParams): string {
  const searchParams = new URLSearchParams();

  if (params.source) {
    searchParams.set('source', params.source);
  }
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

export type UpdateDeviceInput = {
  name?: string;
  notes?: string;
  iconKey?: string | null;
  iconOverride?: boolean | null;
  isArchived?: boolean;
};

export async function listDevices(
  params?: { includeArchived?: boolean },
  options?: RequestOptions
): Promise<ListResponse<Device>> {
  const query = new URLSearchParams();
  if (params?.includeArchived) {
    query.set('includeArchived', 'true');
  }
  const suffix = query.toString();
  const path = suffix ? `/api/devices?${suffix}` : '/api/devices';
  return getJson<ListResponse<Device>>(path, options);
}

export async function updateDevice(
  deviceId: string,
  input: UpdateDeviceInput,
  options?: RequestOptions
): Promise<DeviceMutable> {
  return requestJson<DeviceMutable>(`/api/devices/${deviceId}`, {
    method: 'PATCH',
    json: input,
    ...withQueryApiKey(options)
  });
}

export async function archiveDevice(
  deviceId: string,
  options?: RequestOptions
): Promise<{ mode: 'archive'; device: DeviceMutable }> {
  return requestJson<{ mode: 'archive'; device: DeviceMutable }>(
    `/api/devices/${deviceId}?mode=archive`,
    {
      method: 'DELETE',
      ...withQueryApiKey(options)
    }
  );
}

export async function deleteDevice(
  deviceId: string,
  options?: RequestOptions
): Promise<{ mode: 'delete'; deleted: true }> {
  const scoped = withQueryApiKey(options);
  return requestJson<{ mode: 'delete'; deleted: true }>(`/api/devices/${deviceId}?mode=delete`, {
    method: 'DELETE',
    ...scoped,
    headers: {
      ...(scoped?.headers ?? {}),
      'X-Confirm-Delete': 'DELETE'
    }
  });
}

export async function getDeviceLatest(deviceId: string, options?: RequestOptions): Promise<DeviceLatest> {
  return getJson<DeviceLatest>(`/api/devices/${deviceId}/latest`, options);
}

export async function getDeviceById(
  deviceId: string,
  options?: RequestOptions
): Promise<DeviceDetail> {
  return getJson<DeviceDetail>(`/api/devices/${deviceId}`, options);
}

const queryApiKey = (import.meta.env.VITE_QUERY_API_KEY ?? '').trim();

function withQueryApiKey(options?: RequestOptions): RequestOptions | undefined {
  if (!queryApiKey) {
    return options;
  }
  return {
    ...options,
    headers: {
      ...(options?.headers ?? {}),
      'X-API-Key': queryApiKey
    }
  };
}

export async function listLorawanEvents(
  params: { deviceUid?: string; limit?: number },
  options?: RequestOptions
): Promise<ListResponse<LorawanEvent>> {
  const searchParams = new URLSearchParams();
  if (params.deviceUid) {
    searchParams.set('deviceUid', params.deviceUid);
  }
  if (typeof params.limit === 'number') {
    searchParams.set('limit', String(params.limit));
  }
  const query = searchParams.toString();
  const path = query ? `/api/lorawan/events?${query}` : '/api/lorawan/events';
  return getJson<ListResponse<LorawanEvent>>(path, withQueryApiKey(options));
}

export async function getLorawanEventById(
  id: string,
  options?: RequestOptions
): Promise<LorawanEventDetail> {
  return getJson<LorawanEventDetail>(`/api/lorawan/events/${id}`, withQueryApiKey(options));
}

export async function getLorawanSummary(options?: RequestOptions): Promise<LorawanSummary> {
  return getJson<LorawanSummary>('/api/lorawan/summary', withQueryApiKey(options));
}

export async function listMeshtasticEvents(
  params: { deviceUid?: string; limit?: number },
  options?: RequestOptions
): Promise<ListResponse<MeshtasticEvent>> {
  const searchParams = new URLSearchParams();
  if (params.deviceUid) {
    searchParams.set('deviceUid', params.deviceUid);
  }
  if (typeof params.limit === 'number') {
    searchParams.set('limit', String(params.limit));
  }
  const query = searchParams.toString();
  const path = query ? `/api/meshtastic/events?${query}` : '/api/meshtastic/events';
  return getJson<ListResponse<MeshtasticEvent>>(path, withQueryApiKey(options));
}

export async function getMeshtasticEventById(
  id: string,
  options?: RequestOptions
): Promise<MeshtasticEventDetail> {
  return getJson<MeshtasticEventDetail>(`/api/meshtastic/events/${id}`, withQueryApiKey(options));
}

export async function reprocessLorawanEvent(
  id: string,
  options?: RequestOptions
): Promise<{ status: string }> {
  return requestJson<{ status: string }>(`/api/lorawan/events/${id}/reprocess`, {
    method: 'POST',
    ...withQueryApiKey(options)
  });
}

export async function reprocessLorawanBatch(
  filters: { deviceUid?: string; since?: string | Date; processingError?: string },
  options?: RequestOptions
): Promise<{ resetCount: number }> {
  const payload = {
    deviceUid: filters.deviceUid,
    processingError: filters.processingError,
    since: filters.since ? toIso(filters.since) : undefined
  };
  return requestJson<{ resetCount: number }>('/api/lorawan/reprocess', {
    method: 'POST',
    json: payload,
    ...withQueryApiKey(options)
  });
}

export async function listSessions(
  deviceId: string,
  options?: RequestOptions
): Promise<ListResponse<Session>> {
  const params = new URLSearchParams({ deviceId });
  return getJson<ListResponse<Session>>(`/api/sessions?${params.toString()}`, options);
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

export async function getSessionTimeline(
  sessionId: string,
  options?: RequestOptions
): Promise<SessionTimeline> {
  return getJson<SessionTimeline>(`/api/sessions/${sessionId}/timeline`, options);
}

export async function getSessionWindow(
  params: SessionWindowParams,
  options?: RequestOptions
): Promise<SessionWindowResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('cursor', toIso(params.cursor));
  searchParams.set('windowMs', String(params.windowMs));
  if (typeof params.limit === 'number') {
    searchParams.set('limit', String(params.limit));
  }
  if (typeof params.sample === 'number') {
    searchParams.set('sample', String(params.sample));
  }

  const query = searchParams.toString();
  const path = `/api/sessions/${params.sessionId}/window${query ? `?${query}` : ''}`;
  return getJson<SessionWindowResponse>(path, options);
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

export async function getCoverageBins(
  params: CoverageQueryParams,
  options?: RequestOptions
): Promise<CoverageBinsResponse> {
  const query = buildCoverageQuery(params);
  const path = query ? `/api/coverage/bins?${query}` : '/api/coverage/bins';
  return getJson<CoverageBinsResponse>(path, options);
}

export async function listGateways(
  params: GatewayQueryParams,
  options?: RequestOptions
): Promise<ListResponse<GatewaySummary>> {
  const query = buildGatewayQuery(params);
  const path = query ? `/api/gateways?${query}` : '/api/gateways';
  return getJson<ListResponse<GatewaySummary>>(path, withQueryApiKey(options));
}

export async function getGatewayStats(
  gatewayId: string,
  params: GatewayQueryParams,
  options?: RequestOptions
): Promise<GatewayStats> {
  const query = buildGatewayQuery(params);
  const path = query ? `/api/gateways/${gatewayId}/stats?${query}` : `/api/gateways/${gatewayId}/stats`;
  return getJson<GatewayStats>(path, withQueryApiKey(options));
}

export async function listReceivers(
  params: ReceiversQueryParams,
  options?: RequestOptions
): Promise<ListResponse<ReceiverSummary>> {
  const query = buildReceiversQuery(params);
  const path = query ? `/api/receivers?${query}` : '/api/receivers';
  const data = await getJson<ReceiverSummary[] | ListResponse<ReceiverSummary>>(
    path,
    withQueryApiKey(options)
  );
  if (Array.isArray(data)) {
    return { items: data, count: data.length };
  }
  if (data && Array.isArray((data as ListResponse<ReceiverSummary>).items)) {
    return data as ListResponse<ReceiverSummary>;
  }
  return { items: [], count: 0 };
}

export async function getAutoSession(deviceId: string, options?: RequestOptions): Promise<AutoSessionConfig> {
  return getJson<AutoSessionConfig>(`/api/devices/${deviceId}/auto-session`, withQueryApiKey(options));
}

export async function updateAutoSession(
  deviceId: string,
  input: AutoSessionConfig,
  options?: RequestOptions
): Promise<AutoSessionConfig> {
  return requestJson<AutoSessionConfig>(`/api/devices/${deviceId}/auto-session`, {
    method: 'PUT',
    json: input,
    ...withQueryApiKey(options)
  });
}

export async function getAgentDecisions(
  deviceId: string,
  limit = 1,
  options?: RequestOptions
): Promise<ListResponse<AgentDecision>> {
  const query = new URLSearchParams();
  if (Number.isFinite(limit) && limit > 0) {
    query.set('limit', String(Math.floor(limit)));
  }
  const suffix = query.toString();
  const path = suffix
    ? `/api/devices/${deviceId}/agent-decisions?${suffix}`
    : `/api/devices/${deviceId}/agent-decisions`;
  return getJson<ListResponse<AgentDecision>>(path, withQueryApiKey(options));
}
