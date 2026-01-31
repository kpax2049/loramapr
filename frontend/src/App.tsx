import { useMemo, useState } from 'react';
import type { Bbox, MeasurementQueryParams } from './api/endpoints';
import Controls from './components/Controls';
import MapView from './components/MapView';
import { useMeasurements, useTrack } from './query/hooks';
import './App.css';

const DEFAULT_LIMIT = 2000;

function App() {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [showPoints, setShowPoints] = useState(true);
  const [showTrack, setShowTrack] = useState(true);

  const measurementsParams = useMemo<MeasurementQueryParams>(
    () => ({
      deviceId: deviceId ?? undefined,
      from: from || undefined,
      to: to || undefined,
      bbox: bbox ?? undefined,
      limit: DEFAULT_LIMIT
    }),
    [deviceId, from, to, bbox]
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
      />
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
