import { useQuery } from '@tanstack/react-query';
import { getMeasurements, getTrack, listDevices } from '../api/endpoints';
import type { MeasurementQueryParams, MeasurementsResponse, TrackResponse } from '../api/endpoints';
import type { Device } from '../api/types';

type MeasurementKeyParams = {
  deviceId: string | null;
  sessionId: string | null;
  from: string | null;
  to: string | null;
  bbox: string | null;
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
    limit: typeof params.limit === 'number' ? params.limit : null
  };
}

export function useDevices() {
  return useQuery<Device[]>({
    queryKey: ['devices'],
    queryFn: listDevices
  });
}

export function useMeasurements(params: MeasurementQueryParams) {
  const keyParams = normalizeMeasurementParams(params);

  return useQuery<MeasurementsResponse>({
    queryKey: ['measurements', keyParams],
    queryFn: () => getMeasurements(params)
  });
}

export function useTrack(params: MeasurementQueryParams) {
  const keyParams = normalizeMeasurementParams(params);

  return useQuery<TrackResponse>({
    queryKey: ['track', keyParams],
    queryFn: () => getTrack(params)
  });
}
