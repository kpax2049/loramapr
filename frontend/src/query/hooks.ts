import { useQuery } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import { getDeviceLatest, getMeasurements, getStats, getTrack, listDevices } from '../api/endpoints';
import type { MeasurementQueryParams, MeasurementsResponse, StatsResponse, TrackResponse } from '../api/endpoints';
import type { Device, DeviceLatest } from '../api/types';

type MeasurementKeyParams = {
  deviceId: string | null;
  sessionId: string | null;
  from: string | null;
  to: string | null;
  bbox: string | null;
  gatewayId: string | null;
  limit: number | null;
};

function toIso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeMeasurementParams(params: MeasurementQueryParams): MeasurementKeyParams {
  const bbox = params.bbox
    ? `${params.bbox.minLon},${params.bbox.minLat},${params.bbox.maxLon},${params.bbox.maxLat}`
    : null;

  return {
    deviceId: params.deviceId ?? null,
    sessionId: params.sessionId ?? null,
    from: params.from ? toIso(params.from) : null,
    to: params.to ? toIso(params.to) : null,
    bbox,
    gatewayId: params.gatewayId ?? null,
    limit: typeof params.limit === 'number' ? params.limit : null
  };
}

export function useDevices() {
  return useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: ({ signal }) => listDevices({ signal })
  });
}

export function useDeviceLatest(deviceId?: string) {
  const enabled = Boolean(deviceId);

  return useQuery<DeviceLatest>({
    queryKey: ['device-latest', deviceId ?? null],
    queryFn: ({ signal }) => getDeviceLatest(deviceId as string, { signal }),
    enabled,
    refetchInterval: enabled ? 3000 : false
  });
}

type QueryOptions<T> = Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>;

export function useMeasurements(params: MeasurementQueryParams, options?: QueryOptions<MeasurementsResponse>) {
  const keyParams = normalizeMeasurementParams(params);
  const enabled = options?.enabled ?? Boolean(params.deviceId || params.sessionId);

  return useQuery<MeasurementsResponse>({
    queryKey: ['measurements', keyParams],
    queryFn: ({ signal }) => getMeasurements(params, { signal }),
    ...options,
    enabled
  });
}

export function useTrack(params: MeasurementQueryParams, options?: QueryOptions<TrackResponse>) {
  const keyParams = normalizeMeasurementParams(params);
  const enabled = options?.enabled ?? Boolean(params.deviceId || params.sessionId);

  return useQuery<TrackResponse>({
    queryKey: ['track', keyParams],
    queryFn: ({ signal }) => getTrack(params, { signal }),
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
