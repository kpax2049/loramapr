import { useEffect, useMemo, useState } from 'react';
import type { MeasurementQueryParams } from './api/endpoints';
import type { Measurement } from './api/types';
import Controls from './components/Controls';
import MapView from './components/MapView';
import PointDetails from './components/PointDetails';
import { useMeasurements, useTrack } from './query/hooks';
import './App.css';

const DEFAULT_LIMIT = 2000;
const BBOX_DEBOUNCE_MS = 300;

function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [debouncedBbox, setDebouncedBbox] = useState<[number, number, number, number] | null>(null);
  const [showPoints, setShowPoints] = useState(true);
  const [showTrack, setShowTrack] = useState(true);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedBbox(bbox);
    }, BBOX_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [bbox]);

  const measurementsParams = useMemo<MeasurementQueryParams>(
    () => ({
      deviceId: deviceId ?? undefined,
      from: from || undefined,
      to: to || undefined,
      bbox: debouncedBbox
        ? {
            minLon: debouncedBbox[0],
            minLat: debouncedBbox[1],
            maxLon: debouncedBbox[2],
            maxLat: debouncedBbox[3]
          }
        : undefined,
      limit: DEFAULT_LIMIT
    }),
    [deviceId, from, to, debouncedBbox]
  );

  const trackParams = useMemo<MeasurementQueryParams>(
    () => ({
      deviceId: deviceId ?? undefined,
      from: from || undefined,
      to: to || undefined,
      limit: DEFAULT_LIMIT
    }),
    [deviceId, from, to]
  );

  const measurementsQuery = useMeasurements(measurementsParams, {
    enabled: Boolean(deviceId)
  });
  const trackQuery = useTrack(trackParams, {
    enabled: Boolean(deviceId)
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
      />
      <PointDetails measurement={selectedMeasurement} />
      <Controls
        deviceId={deviceId}
        onDeviceChange={setDeviceId}
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
