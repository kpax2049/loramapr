import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { UseQueryOptions } from '@tanstack/react-query';
import {
  getCoverageBins,
  getDeviceLatest,
  getGatewayStats,
  getMeasurements,
  getStats,
  getTrack,
  listGateways,
  listDevices
} from '../api/endpoints';
import { ApiError } from '../api/http';
import type {
  CoverageQueryParams,
  GatewayQueryParams,
  MeasurementQueryParams,
  MeasurementsResponse,
  StatsResponse,
  TrackResponse
} from '../api/endpoints';
import type {
  CoverageBinsResponse,
  Device,
  DeviceLatest,
  GatewayStats,
  GatewaySummary
} from '../api/types';

type MeasurementKeyParams = {
  deviceId: string | null;
  sessionId: string | null;
  from: string | null;
  to: string | null;
  bbox: string | null;
  gatewayId: string | null;
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
  filterMode: 'time' | 'session' | null;
};

type GatewayKeyParams = {
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
  const bbox = params.bbox
    ? `${params.bbox.minLon},${params.bbox.minLat},${params.bbox.maxLon},${params.bbox.maxLat}`
    : 'none';

  return {
    deviceId: params.deviceId ?? null,
    sessionId: params.sessionId ?? null,
    day: params.day ? toIso(params.day) : null,
    bbox,
    gatewayId: params.gatewayId ?? null,
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

export function useDevices() {
  return useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: ({ signal }) => listDevices({ signal })
  });
}

export function useDevice(deviceId?: string | null) {
  const devicesQuery = useDevices();
  const device = useMemo(
    () => devicesQuery.data?.find((item) => item.id === deviceId) ?? null,
    [devicesQuery.data, deviceId]
  );

  return { ...devicesQuery, device };
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
  options?: QueryOptions<GatewaySummary[]>,
  context?: { filterMode?: 'time' | 'session' }
) {
  const keyParams = normalizeGatewayParams(params, context);
  const enabled = options?.enabled ?? Boolean(params.deviceId || params.sessionId);

  return useQuery<GatewaySummary[]>({
    queryKey: ['gateways', keyParams],
    queryFn: ({ signal }) => listGateways(params, { signal }),
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
  const enabled =
    options?.enabled ??
    (Boolean(params.deviceId || params.sessionId) && Boolean(params.bbox));

  return useQuery<CoverageBinsResponse>({
    queryKey: ['coverage-bins', keyParams],
    queryFn: ({ signal }) => getCoverageBins(params, { signal }),
    ...options,
    enabled
  });
}
