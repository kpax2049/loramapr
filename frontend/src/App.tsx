import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { MeasurementQueryParams } from './api/endpoints';
import type { Measurement } from './api/types';
import Controls from './components/Controls';
import LorawanEventsPanel from './components/LorawanEventsPanel';
import MapView from './components/MapView';
import PointDetails from './components/PointDetails';
import StatsCard from './components/StatsCard';
import { useDevice, useDeviceLatest, useMeasurements, useStats, useTrack } from './query/hooks';
import './App.css';

const DEFAULT_LIMIT = 2000;
const LOW_ZOOM_LIMIT = 1000;
const LIMIT_ZOOM_THRESHOLD = 12;
const BBOX_DEBOUNCE_MS = 300;

type InitialQueryState = {
  deviceId: string | null;
  filterMode: 'time' | 'session';
  sessionId: string | null;
  from: string;
  to: string;
  showPoints: boolean;
  showTrack: boolean;
};

function parseBoolean(value: string | null, defaultValue: boolean): boolean {
  if (value === null) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return defaultValue;
}

function readInitialQueryState(): InitialQueryState {
  if (typeof window === 'undefined') {
    return {
      deviceId: null,
      filterMode: 'time',
      sessionId: null,
      from: '',
      to: '',
      showPoints: true,
      showTrack: true
    };
  }

  const params = new URLSearchParams(window.location.search);
  const filterModeParam = params.get('filterMode');
  const filterMode = filterModeParam === 'session' ? 'session' : 'time';

  return {
    deviceId: params.get('deviceId'),
    filterMode,
    sessionId: params.get('sessionId'),
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    showPoints: parseBoolean(params.get('showPoints'), true),
    showTrack: parseBoolean(params.get('showTrack'), true)
  };
}

function App() {
  const initial = useMemo(() => readInitialQueryState(), []);

  const queryClient = useQueryClient();
  const prevLatestMeasurementAt = useRef<string | null>(null);

  const [deviceId, setDeviceId] = useState<string | null>(initial.deviceId);
  const [filterMode, setFilterMode] = useState<'time' | 'session'>(initial.filterMode);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initial.sessionId);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [debouncedBbox, setDebouncedBbox] = useState<[number, number, number, number] | null>(null);
  const [currentZoom, setCurrentZoom] = useState(12);
  const [showPoints, setShowPoints] = useState(initial.showPoints);
  const [showTrack, setShowTrack] = useState(initial.showTrack);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedBbox(bbox);
    }, BBOX_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [bbox]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams();
    if (deviceId) {
      params.set('deviceId', deviceId);
    }
    params.set('filterMode', filterMode);
    if (selectedSessionId) {
      params.set('sessionId', selectedSessionId);
    }
    if (from) {
      params.set('from', from);
    }
    if (to) {
      params.set('to', to);
    }
    if (!showPoints) {
      params.set('showPoints', 'false');
    }
    if (!showTrack) {
      params.set('showTrack', 'false');
    }

    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [deviceId, filterMode, selectedSessionId, from, to, showPoints, showTrack]);

  const handleFilterModeChange = (mode: 'time' | 'session') => {
    setFilterMode(mode);
    if (mode === 'session') {
      setFrom('');
      setTo('');
    } else {
      setSelectedSessionId(null);
    }
  };

  const handleSessionStart = (sessionId: string) => {
    handleFilterModeChange('session');
    setSelectedSessionId(sessionId);
  };

  const bboxPayload = useMemo(
    () =>
      debouncedBbox
        ? {
            minLon: debouncedBbox[0],
            minLat: debouncedBbox[1],
            maxLon: debouncedBbox[2],
            maxLat: debouncedBbox[3]
          }
        : undefined,
    [debouncedBbox]
  );

  const isSessionMode = filterMode === 'session' && Boolean(selectedSessionId);

  const effectiveLimit = currentZoom <= LIMIT_ZOOM_THRESHOLD ? LOW_ZOOM_LIMIT : DEFAULT_LIMIT;

  const measurementsParams = useMemo<MeasurementQueryParams>(
    () =>
      isSessionMode
        ? {
            sessionId: selectedSessionId ?? undefined,
            bbox: bboxPayload,
            gatewayId: selectedGatewayId ?? undefined,
            limit: effectiveLimit
          }
        : {
            deviceId: deviceId ?? undefined,
            from: from || undefined,
            to: to || undefined,
            bbox: bboxPayload,
            gatewayId: selectedGatewayId ?? undefined,
            limit: effectiveLimit
          },
    [isSessionMode, selectedSessionId, bboxPayload, deviceId, from, to, selectedGatewayId, effectiveLimit]
  );

  const trackParams = useMemo<MeasurementQueryParams>(
    () =>
      isSessionMode
        ? {
            sessionId: selectedSessionId ?? undefined,
            gatewayId: selectedGatewayId ?? undefined,
            limit: effectiveLimit
          }
        : {
            deviceId: deviceId ?? undefined,
            from: from || undefined,
            to: to || undefined,
            gatewayId: selectedGatewayId ?? undefined,
            limit: effectiveLimit
          },
    [isSessionMode, selectedSessionId, deviceId, from, to, selectedGatewayId, effectiveLimit]
  );

  const sessionPolling = isSessionMode ? 2000 : false;

  const measurementsQuery = useMeasurements(
    measurementsParams,
    {
      enabled: isSessionMode ? Boolean(selectedSessionId) : Boolean(deviceId)
    },
    { filterMode, refetchIntervalMs: sessionPolling }
  );
  const trackQuery = useTrack(
    trackParams,
    {
      enabled: isSessionMode ? Boolean(selectedSessionId) : Boolean(deviceId)
    },
    { filterMode, refetchIntervalMs: sessionPolling }
  );

  const gatewayIds = useMemo(() => {
    const items = measurementsQuery.data?.items ?? [];
    const ids = new Set<string>();
    for (const item of items) {
      if (item.gatewayId) {
        ids.add(item.gatewayId);
      }
    }
    return Array.from(ids).sort((a, b) => a.localeCompare(b));
  }, [measurementsQuery.data?.items]);
  const statsParams = useMemo<MeasurementQueryParams>(
    () =>
      isSessionMode
        ? {
            sessionId: selectedSessionId ?? undefined
          }
        : {
            deviceId: deviceId ?? undefined,
            from: from || undefined,
            to: to || undefined
          },
    [isSessionMode, selectedSessionId, deviceId, from, to]
  );
  const statsQuery = useStats(statsParams, {
    enabled: isSessionMode ? Boolean(selectedSessionId) : Boolean(deviceId)
  });
  const { device: selectedDevice } = useDevice(deviceId);
  const latestDeviceQuery = useDeviceLatest(deviceId ?? undefined);

  const selectedMeasurement = useMemo<Measurement | null>(() => {
    if (!selectedPointId) {
      return null;
    }
    return measurementsQuery.data?.items.find((item) => item.id === selectedPointId) ?? null;
  }, [measurementsQuery.data?.items, selectedPointId]);

  useEffect(() => {
    if (selectedPointId && !selectedMeasurement) {
      setSelectedPointId(null);
    }
  }, [selectedMeasurement, selectedPointId]);

  useEffect(() => {
    setSelectedSessionId(null);
  }, [deviceId]);

  useEffect(() => {
    setSelectedGatewayId(null);
  }, [deviceId, selectedSessionId]);

  useEffect(() => {
    if (!deviceId) {
      prevLatestMeasurementAt.current = null;
      return;
    }

    const latestMeasurementAt = latestDeviceQuery.data?.lastMeasurementAt ?? null;
    if (!latestMeasurementAt) {
      prevLatestMeasurementAt.current = latestMeasurementAt;
      return;
    }

    const prev = prevLatestMeasurementAt.current;
    if (prev) {
      const latestTime = new Date(latestMeasurementAt).getTime();
      const prevTime = new Date(prev).getTime();
      if (Number.isFinite(latestTime) && Number.isFinite(prevTime) && latestTime > prevTime) {
        const bboxKey = bboxPayload
          ? `${bboxPayload.minLon},${bboxPayload.minLat},${bboxPayload.maxLon},${bboxPayload.maxLat}`
          : null;
        const normalizeTime = (value?: string | Date) =>
          value ? (value instanceof Date ? value.toISOString() : value) : null;
        const measurementsKey = {
          deviceId: measurementsParams.deviceId ?? null,
          sessionId: measurementsParams.sessionId ?? null,
          from: normalizeTime(measurementsParams.from),
          to: normalizeTime(measurementsParams.to),
          bbox: bboxKey,
          gatewayId: measurementsParams.gatewayId ?? null,
          limit: typeof measurementsParams.limit === 'number' ? measurementsParams.limit : null,
          filterMode
        };
        const trackKey = {
          deviceId: trackParams.deviceId ?? null,
          sessionId: trackParams.sessionId ?? null,
          from: normalizeTime(trackParams.from),
          to: normalizeTime(trackParams.to),
          bbox: null,
          gatewayId: trackParams.gatewayId ?? null,
          limit: typeof trackParams.limit === 'number' ? trackParams.limit : null,
          filterMode
        };

        queryClient.invalidateQueries({ queryKey: ['measurements', measurementsKey] });
        queryClient.invalidateQueries({ queryKey: ['track', trackKey] });
      }
    }

    prevLatestMeasurementAt.current = latestMeasurementAt;
  }, [
    deviceId,
    latestDeviceQuery.data?.lastMeasurementAt,
    measurementsParams,
    trackParams,
    bboxPayload,
    filterMode,
    queryClient
  ]);

  const isLoading = measurementsQuery.isLoading || trackQuery.isLoading;
  const error = measurementsQuery.error ?? trackQuery.error;

  return (
    <div className="app">
      <MapView
        measurements={measurementsQuery.data?.items ?? []}
        track={trackQuery.data?.items ?? []}
        showPoints={showPoints}
        showTrack={showTrack}
        onBoundsChange={setBbox}
        onSelectPoint={setSelectedPointId}
        onZoomChange={setCurrentZoom}
        selectedPointId={selectedPointId}
      />
      {measurementsQuery.data &&
        measurementsQuery.data.items.length === measurementsQuery.data.limit && (
          <div className="limit-banner">Result limited; zoom in or narrow filters</div>
        )}
      <div className="right-column">
        <PointDetails measurement={selectedMeasurement} />
        <LorawanEventsPanel deviceUid={selectedDevice?.deviceUid} />
        <StatsCard
        stats={statsQuery.data}
        isLoading={statsQuery.isLoading}
        error={statsQuery.error as Error | null}
        />
      </div>
      <Controls
        deviceId={deviceId}
        onDeviceChange={setDeviceId}
        filterMode={filterMode}
        onFilterModeChange={handleFilterModeChange}
        selectedSessionId={selectedSessionId}
        onSelectSessionId={setSelectedSessionId}
        onStartSession={handleSessionStart}
        gatewayIds={gatewayIds}
        selectedGatewayId={selectedGatewayId}
        onSelectGatewayId={setSelectedGatewayId}
        latest={latestDeviceQuery.data}
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        showPoints={showPoints}
        showTrack={showTrack}
        onShowPointsChange={setShowPoints}
        onShowTrackChange={setShowTrack}
      />
      {(isLoading || error) && (
        <div className="status">
          {isLoading && <p>Loading map data…</p>}
          {error && (
            <p className="status__error">
              {(error as Error).message || 'Failed to load map data.'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
