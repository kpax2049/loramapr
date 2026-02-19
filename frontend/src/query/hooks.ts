import { useQuery } from '@tanstack/react-query';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { UseQueryOptions } from '@tanstack/react-query';
import {
  archiveDevice,
  deleteDevice,
  getAutoSession,
  getAgentDecisions,
  getDeviceById,
  getCoverageBins,
  getDeviceLatest,
  getGatewayStats,
  getMeasurements,
  getStats,
  getSystemStatus,
  getTrack,
  updateDevice,
  updateAutoSession,
  listReceivers,
  listGateways,
  listDevices,
  type UpdateDeviceInput
} from '../api/endpoints';
import { ApiError } from '../api/http';
import type {
  CoverageQueryParams,
  GatewayQueryParams,
  MeasurementQueryParams,
  MeasurementsResponse,
  ReceiversQueryParams,
  StatsResponse,
  TrackResponse
} from '../api/endpoints';
import type {
  CoverageBinsResponse,
  AutoSessionConfig,
  AgentDecision,
  Device,
  DeviceDetail,
  DeviceLatest,
  GatewayStats,
  GatewaySummary,
  ReceiverSummary,
  ListResponse,
  SystemStatus
} from '../api/types';

type MeasurementKeyParams = {
  deviceId: string | null;
  sessionId: string | null;
  from: string | null;
  to: string | null;
  bbox: string | null;
  gatewayId: string | null;
  receiverId: string | null;
  rxGatewayId: string | null;
  sample: number | null;
  limit: number | null;
  filterMode: 'time' | 'session' | null;
};

type CoverageKeyParams = {
  deviceId: string | null;
  sessionId: string | null;
  day: string | null;
  bbox: string | null;
  gatewayId: string | null;
  limit: number | null;
  filterMode: 'time' | 'session' | null;
};

type GatewayKeyParams = {
  deviceId: string | null;
  sessionId: string | null;
  from: string | null;
  to: string | null;
  filterMode: 'time' | 'session' | null;
};

type ReceiversKeyParams = {
  source: 'lorawan' | 'meshtastic' | 'any' | null;
  deviceId: string | null;
  sessionId: string | null;
  from: string | null;
  to: string | null;
  filterMode: 'time' | 'session' | null;
};

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeMeasurementParams(
  params: MeasurementQueryParams,
  context?: { filterMode?: 'time' | 'session' }
): MeasurementKeyParams {
  const bbox = params.bbox
    ? `${params.bbox.minLon},${params.bbox.minLat},${params.bbox.maxLon},${params.bbox.maxLat}`
    : 'none';

  return {
    deviceId: params.deviceId ?? null,
    sessionId: params.sessionId ?? null,
    from: params.from ? toIso(params.from) : null,
    to: params.to ? toIso(params.to) : null,
    bbox,
    gatewayId: params.gatewayId ?? null,
    receiverId: params.receiverId ?? null,
    rxGatewayId: params.rxGatewayId ?? null,
    sample: typeof params.sample === 'number' ? params.sample : null,
    limit: typeof params.limit === 'number' ? params.limit : null,
    filterMode: context?.filterMode ?? (params.sessionId ? 'session' : 'time')
  };
}

function normalizeCoverageParams(
  params: CoverageQueryParams,
  context?: { filterMode?: 'time' | 'session' }
): CoverageKeyParams {
  const bbox = params.bbox ? params.bbox.join(',') : 'none';

  return {
    deviceId: params.deviceId ?? null,
    sessionId: params.sessionId ?? null,
    day: params.day ?? null,
    bbox,
    gatewayId: params.gatewayId ?? null,
    limit: typeof params.limit === 'number' ? params.limit : null,
    filterMode: context?.filterMode ?? (params.sessionId ? 'session' : 'time')
  };
}

function normalizeGatewayParams(
  params: GatewayQueryParams,
  context?: { filterMode?: 'time' | 'session' }
): GatewayKeyParams {
  return {
    deviceId: params.deviceId ?? null,
    sessionId: params.sessionId ?? null,
    from: params.from ? toIso(params.from) : null,
    to: params.to ? toIso(params.to) : null,
    filterMode: context?.filterMode ?? (params.sessionId ? 'session' : 'time')
  };
}

function normalizeReceiversParams(
  params: ReceiversQueryParams,
  context?: { filterMode?: 'time' | 'session' }
): ReceiversKeyParams {
  return {
    source: params.source ?? null,
    deviceId: params.deviceId ?? null,
    sessionId: params.sessionId ?? null,
    from: params.from ? toIso(params.from) : null,
    to: params.to ? toIso(params.to) : null,
    filterMode: context?.filterMode ?? (params.sessionId ? 'session' : 'time')
  };
}

export function useDevices(
  includeArchived = false,
  options?: Omit<UseQueryOptions<ListResponse<Device>>, 'queryKey' | 'queryFn'>
) {
  const enabled = options?.enabled ?? true;
  return useQuery<ListResponse<Device>>({
    queryKey: ['devices', includeArchived ? 'with-archived' : 'active-only'],
    queryFn: ({ signal }) => listDevices({ includeArchived }, { signal }),
    ...options,
    enabled
  });
}

export function useDevice(deviceId?: string | null) {
  const devicesQuery = useDevices();
  const items = devicesQuery.data?.items ?? [];
  const device = useMemo(
    () => items.find((item) => item.id === deviceId) ?? null,
    [items, deviceId]
  );

  return { ...devicesQuery, device };
}

export function useDeviceDetail(deviceId?: string | null, options?: QueryOptions<DeviceDetail>) {
  const enabled = options?.enabled ?? Boolean(deviceId);

  return useQuery<DeviceDetail>({
    queryKey: ['device-detail', deviceId ?? null],
    queryFn: ({ signal }) => getDeviceById(deviceId as string, { signal }),
    ...options,
    enabled
  });
}

export function useDevicesLatestLocations(
  deviceIds: string[],
  options?: QueryOptions<DeviceDetail[]>
) {
  const enabled = options?.enabled ?? deviceIds.length > 0;

  return useQuery<DeviceDetail[]>({
    queryKey: ['devices-latest-locations', deviceIds],
    queryFn: async ({ signal }) => {
      if (deviceIds.length === 0) {
        return [];
      }

      const results = await Promise.allSettled(
        deviceIds.map((id) => getDeviceById(id, { signal }))
      );

      const items: DeviceDetail[] = [];
      for (const result of results) {
        if (result.status !== 'fulfilled') {
          continue;
        }
        const latest = result.value.latestMeasurement;
        if (!latest || !Number.isFinite(latest.lat) || !Number.isFinite(latest.lon)) {
          continue;
        }
        items.push(result.value);
      }

      return items;
    },
    ...options,
    enabled
  });
}

export function useDeviceLatest(deviceId?: string) {
  const [unsupported, setUnsupported] = useState(false);
  const enabled = Boolean(deviceId) && !unsupported;

  return useQuery<DeviceLatest>({
    queryKey: ['device-latest', deviceId ?? null],
    queryFn: ({ signal }) => getDeviceLatest(deviceId as string, { signal }),
    enabled,
    refetchInterval: enabled ? 3000 : false,
    retry: (failureCount, error) => {
      if (error instanceof ApiError && error.status === 404) {
        return false;
      }
      return failureCount < 3;
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 404) {
        setUnsupported(true);
      }
    }
  });
}

export function useAutoSession(
  deviceId?: string | null,
  options?: QueryOptions<AutoSessionConfig>
) {
  const enabled = options?.enabled ?? Boolean(deviceId);

  return useQuery<AutoSessionConfig>({
    queryKey: ['auto-session', deviceId ?? 'none'],
    queryFn: ({ signal }) => getAutoSession(deviceId as string, { signal }),
    ...options,
    enabled
  });
}

export function useUpdateAutoSession(deviceId?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AutoSessionConfig) => updateAutoSession(deviceId as string, input),
    onSuccess: () => {
      if (deviceId) {
        queryClient.invalidateQueries({ queryKey: ['auto-session', deviceId] });
      }
    }
  });
}

export function useUpdateDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { deviceId: string; data: UpdateDeviceInput }) =>
      updateDevice(input.deviceId, input.data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['device-detail', variables.deviceId] });
    }
  });
}

export function useArchiveDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) => archiveDevice(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    }
  });
}

export function useDeleteDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deviceId: string) => deleteDevice(deviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
    }
  });
}

export function useAgentDecisions(
  deviceId?: string | null,
  limit = 1,
  options?: QueryOptions<ListResponse<AgentDecision>>
) {
  const enabled = options?.enabled ?? Boolean(deviceId);

  return useQuery<ListResponse<AgentDecision>>({
    queryKey: ['agent-decisions', deviceId ?? 'none', limit],
    queryFn: ({ signal }) => getAgentDecisions(deviceId as string, limit, { signal }),
    ...options,
    enabled
  });
}

export function useSystemStatus(options?: QueryOptions<SystemStatus>) {
  const enabled = options?.enabled ?? true;
  return useQuery<SystemStatus>({
    queryKey: ['system-status'],
    queryFn: ({ signal }) => getSystemStatus({ signal }),
    ...options,
    enabled
  });
}

type QueryOptions<T> = Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>;

export function useMeasurements(
  params: MeasurementQueryParams,
  options?: QueryOptions<MeasurementsResponse>,
  context?: { filterMode?: 'time' | 'session'; refetchIntervalMs?: number | false }
) {
  const keyParams = normalizeMeasurementParams(params, context);
  const enabled = options?.enabled ?? Boolean(params.deviceId || params.sessionId);

  return useQuery<MeasurementsResponse>({
    queryKey: ['measurements', keyParams],
    queryFn: ({ signal }) => getMeasurements(params, { signal }),
    refetchInterval: context?.refetchIntervalMs ?? false,
    ...options,
    enabled
  });
}

export function useTrack(
  params: MeasurementQueryParams,
  options?: QueryOptions<TrackResponse>,
  context?: { filterMode?: 'time' | 'session'; refetchIntervalMs?: number | false }
) {
  const keyParams = normalizeMeasurementParams(params, context);
  const enabled = options?.enabled ?? Boolean(params.deviceId || params.sessionId);

  return useQuery<TrackResponse>({
    queryKey: ['track', keyParams],
    queryFn: ({ signal }) => getTrack(params, { signal }),
    refetchInterval: context?.refetchIntervalMs ?? false,
    ...options,
    enabled
  });
}

export function useStats(params: MeasurementQueryParams, options?: QueryOptions<StatsResponse>) {
  const keyParams = normalizeMeasurementParams(params);
  const enabled = options?.enabled ?? Boolean(params.deviceId || params.sessionId);

  return useQuery<StatsResponse>({
    queryKey: ['stats', keyParams],
    queryFn: ({ signal }) => getStats(params, { signal }),
    ...options,
    enabled
  });
}

export function useGateways(
  params: GatewayQueryParams,
  options?: QueryOptions<ListResponse<GatewaySummary>>,
  context?: { filterMode?: 'time' | 'session' }
) {
  const keyParams = normalizeGatewayParams(params, context);
  const enabled = options?.enabled ?? Boolean(params.deviceId || params.sessionId);

  return useQuery<ListResponse<GatewaySummary>>({
    queryKey: ['gateways', keyParams],
    queryFn: ({ signal }) => listGateways(params, { signal }),
    ...options,
    enabled
  });
}

export function useReceivers(
  params: ReceiversQueryParams,
  options?: QueryOptions<ListResponse<ReceiverSummary>>,
  context?: { filterMode?: 'time' | 'session' }
) {
  const keyParams = normalizeReceiversParams(params, context);
  const enabled = options?.enabled ?? Boolean(params.deviceId || params.sessionId);

  return useQuery<ListResponse<ReceiverSummary>>({
    queryKey: ['receivers', keyParams],
    queryFn: ({ signal }) => listReceivers(params, { signal }),
    ...options,
    enabled
  });
}

export function useGatewayStats(
  gatewayId?: string | null,
  params?: GatewayQueryParams,
  options?: QueryOptions<GatewayStats>,
  context?: { filterMode?: 'time' | 'session' }
) {
  const keyParams = normalizeGatewayParams(params ?? {}, context);
  const enabled = options?.enabled ?? Boolean(gatewayId && (params?.deviceId || params?.sessionId));

  return useQuery<GatewayStats>({
    queryKey: ['gateway-stats', gatewayId ?? 'none', keyParams],
    queryFn: ({ signal }) => getGatewayStats(gatewayId as string, params ?? {}, { signal }),
    ...options,
    enabled
  });
}

export function useCoverageBins(
  params: CoverageQueryParams,
  options?: QueryOptions<CoverageBinsResponse>,
  context?: { filterMode?: 'time' | 'session' }
) {
  const keyParams = normalizeCoverageParams(params, context);
  const enabled = options?.enabled ?? Boolean(params.deviceId || params.sessionId);

  return useQuery<CoverageBinsResponse>({
    queryKey: [
      'coverageBins',
      keyParams.deviceId,
      keyParams.sessionId,
      keyParams.day,
      keyParams.bbox ?? 'none',
      keyParams.gatewayId ?? 'all',
      keyParams.limit
    ],
    queryFn: ({ signal }) => getCoverageBins(params, { signal }),
    ...options,
    enabled
  });
}
