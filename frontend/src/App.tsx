import { useEffect, useMemo, useState } from 'react';
import type { MeasurementQueryParams } from './api/endpoints';
import type { Measurement } from './api/types';
import Controls from './components/Controls';
import MapView from './components/MapView';
import PointDetails from './components/PointDetails';
import { useMeasurements, useTrack } from './query/hooks';
import './App.css';

const DEFAULT_LIMIT = 2000;
const LOW_ZOOM_LIMIT = 1000;
const LIMIT_ZOOM_THRESHOLD = 12;
const BBOX_DEBOUNCE_MS = 300;

function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'time' | 'session'>('time');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [debouncedBbox, setDebouncedBbox] = useState<[number, number, number, number] | null>(null);
  const [currentZoom, setCurrentZoom] = useState(12);
  const [showPoints, setShowPoints] = useState(true);
  const [showTrack, setShowTrack] = useState(true);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedBbox(bbox);
    }, BBOX_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [bbox]);

  const handleFilterModeChange = (mode: 'time' | 'session') => {
    setFilterMode(mode);
    if (mode === 'session') {
      setFrom('');
      setTo('');
    } else {
      setSelectedSessionId(null);
    }
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
            limit: effectiveLimit
          }
        : {
            deviceId: deviceId ?? undefined,
            from: from || undefined,
            to: to || undefined,
            bbox: bboxPayload,
            limit: effectiveLimit
          },
    [isSessionMode, selectedSessionId, bboxPayload, deviceId, from, to, effectiveLimit]
  );

  const trackParams = useMemo<MeasurementQueryParams>(
    () =>
      isSessionMode
        ? {
            sessionId: selectedSessionId ?? undefined,
            limit: effectiveLimit
          }
        : {
            deviceId: deviceId ?? undefined,
            from: from || undefined,
            to: to || undefined,
            limit: effectiveLimit
          },
    [isSessionMode, selectedSessionId, deviceId, from, to, effectiveLimit]
  );

  const measurementsQuery = useMeasurements(measurementsParams, {
    enabled: isSessionMode ? Boolean(selectedSessionId) : Boolean(deviceId)
  });
  const trackQuery = useTrack(trackParams, {
    enabled: isSessionMode ? Boolean(selectedSessionId) : Boolean(deviceId)
  });

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
      />
      {measurementsQuery.data &&
        measurementsQuery.data.items.length === measurementsQuery.data.limit && (
          <div className="limit-banner">Result limited; zoom in or narrow filters</div>
        )}
      <PointDetails measurement={selectedMeasurement} />
      <Controls
        deviceId={deviceId}
        onDeviceChange={setDeviceId}
        filterMode={filterMode}
        onFilterModeChange={handleFilterModeChange}
        selectedSessionId={selectedSessionId}
        onSelectedSessionIdChange={setSelectedSessionId}
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
