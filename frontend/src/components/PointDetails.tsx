import type { Measurement } from '../api/types';

type PointDetailsProps = {
  measurement?: Measurement | null;
};

function formatValue(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  return String(value);
}

function formatCapturedAt(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

export default function PointDetails({ measurement }: PointDetailsProps) {
  if (!measurement) {
    return (
      <aside className="point-details" aria-label="Point details">
        <div className="point-details__empty">Select a point to see details.</div>
      </aside>
    );
  }

  return (
    <aside className="point-details" aria-label="Point details">
      <h2>Point details</h2>
      <dl>
        <div>
          <dt>Captured at</dt>
          <dd>{formatCapturedAt(measurement.capturedAt)}</dd>
        </div>
        <div>
          <dt>Session ID</dt>
          <dd>{measurement.sessionId ?? 'none'}</dd>
        </div>
        <div>
          <dt>Latitude</dt>
          <dd>{formatValue(measurement.lat)}</dd>
        </div>
        <div>
          <dt>Longitude</dt>
          <dd>{formatValue(measurement.lon)}</dd>
        </div>
        <div>
          <dt>RSSI</dt>
          <dd>{formatValue(measurement.rssi)}</dd>
        </div>
        <div>
          <dt>SNR</dt>
          <dd>{formatValue(measurement.snr)}</dd>
        </div>
        <div>
          <dt>SF</dt>
          <dd>{formatValue(measurement.sf)}</dd>
        </div>
        <div>
          <dt>BW</dt>
          <dd>{formatValue(measurement.bw)}</dd>
        </div>
        <div>
          <dt>Frequency</dt>
          <dd>{formatValue(measurement.freq)}</dd>
        </div>
        <div>
          <dt>Gateway ID</dt>
          <dd>{formatValue(measurement.gatewayId)}</dd>
        </div>
      </dl>
    </aside>
  );
}
