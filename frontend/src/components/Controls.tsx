import { useEffect, useState } from 'react';
import type { DeviceLatest } from '../api/types';
import { useDevices } from '../query/hooks';
import SessionsPanel from './SessionsPanel';

type ControlsProps = {
  deviceId: string | null;
  onDeviceChange: (deviceId: string | null) => void;
  filterMode: 'time' | 'session';
  onFilterModeChange: (mode: 'time' | 'session') => void;
  selectedSessionId: string | null;
  onSelectSessionId: (sessionId: string | null) => void;
  onStartSession: (sessionId: string) => void;
  gatewayIds: string[];
  selectedGatewayId: string | null;
  onSelectGatewayId: (gatewayId: string | null) => void;
  latest?: DeviceLatest;
  onFitToData: () => void;
  mapMode: 'points' | 'coverage';
  onMapModeChange: (mode: 'points' | 'coverage') => void;
  coverageMetric: 'count' | 'rssiAvg' | 'snrAvg';
  onCoverageMetricChange: (metric: 'count' | 'rssiAvg' | 'snrAvg') => void;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  showPoints: boolean;
  showTrack: boolean;
  onShowPointsChange: (value: boolean) => void;
  onShowTrackChange: (value: boolean) => void;
};

export default function Controls({
  deviceId,
  onDeviceChange,
  filterMode,
  onFilterModeChange,
  selectedSessionId,
  onSelectSessionId,
  onStartSession,
  gatewayIds,
  selectedGatewayId,
  onSelectGatewayId,
  latest,
  onFitToData,
  mapMode,
  onMapModeChange,
  coverageMetric,
  onCoverageMetricChange,
  from,
  to,
  onFromChange,
  onToChange,
  showPoints,
  showTrack,
  onShowPointsChange,
  onShowTrackChange
}: ControlsProps) {
  const { data: devicesData, isLoading } = useDevices();
  const devices = Array.isArray(devicesData) ? devicesData : [];
  const selectedDevice = devices.find((device) => device.id === deviceId) ?? null;
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!deviceId && devices.length > 0) {
      onDeviceChange(devices[0].id);
    }
  }, [deviceId, devices, onDeviceChange]);

  useEffect(() => {
    setExportError(null);
  }, [selectedSessionId, filterMode]);

  return (
    <section className="controls" aria-label="Map controls">
      <div className="controls__group">
        <label htmlFor="device-select">Device</label>
        <select
          id="device-select"
          value={deviceId ?? ''}
          onChange={(event) => onDeviceChange(event.target.value || null)}
          disabled={isLoading || devices.length === 0}
        >
          <option value="">
            {isLoading ? 'Loading devices...' : 'Select a device'}
          </option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {formatDeviceLabel(device.name, device.deviceUid)}
            </option>
          ))}
        </select>
        {selectedDevice ? (
          <div className="controls__device-meta">
            <span>{formatDeviceLabel(selectedDevice.name, selectedDevice.deviceUid)}</span>
            <button
              type="button"
              className="controls__button controls__button--compact"
              onClick={() => copyDeviceUid(selectedDevice.deviceUid)}
            >
              Copy deviceUid
            </button>
          </div>
        ) : null}
      </div>

      <div className="controls__group">
        <span className="controls__label">Filter mode</span>
        <div className="controls__segmented" role="radiogroup" aria-label="Filter mode">
          <label className={`controls__segment ${filterMode === 'time' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="filter-mode"
              value="time"
              checked={filterMode === 'time'}
              onChange={() => onFilterModeChange('time')}
            />
            Time
          </label>
          <label className={`controls__segment ${filterMode === 'session' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="filter-mode"
              value="session"
              checked={filterMode === 'session'}
              onChange={() => onFilterModeChange('session')}
            />
            Session
          </label>
        </div>
      </div>

      <div className="controls__group">
        <span className="controls__label">Map layer</span>
        <div className="controls__segmented" role="radiogroup" aria-label="Map layer">
          <label className={`controls__segment ${mapMode === 'points' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="map-mode"
              value="points"
              checked={mapMode === 'points'}
              onChange={() => onMapModeChange('points')}
            />
            Points
          </label>
          <label className={`controls__segment ${mapMode === 'coverage' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="map-mode"
              value="coverage"
              checked={mapMode === 'coverage'}
              onChange={() => onMapModeChange('coverage')}
            />
            Coverage
          </label>
        </div>
      </div>

      {mapMode === 'coverage' ? (
        <div className="controls__group">
          <label htmlFor="coverage-metric">Coverage metric</label>
          <select
            id="coverage-metric"
            value={coverageMetric}
            onChange={(event) => onCoverageMetricChange(event.target.value as 'count' | 'rssiAvg' | 'snrAvg')}
          >
            <option value="count">Count</option>
            <option value="rssiAvg">RSSI avg</option>
            <option value="snrAvg">SNR avg</option>
          </select>
          <CoverageLegend metric={coverageMetric} />
        </div>
      ) : null}

      {filterMode === 'time' ? (
        <div className="controls__row">
          <div className="controls__group">
            <label htmlFor="from-input">From</label>
            <input
              id="from-input"
              type="datetime-local"
              value={from}
              onChange={(event) => onFromChange(event.target.value)}
            />
          </div>
          <div className="controls__group">
            <label htmlFor="to-input">To</label>
            <input
              id="to-input"
              type="datetime-local"
              value={to}
              onChange={(event) => onToChange(event.target.value)}
            />
          </div>
        </div>
      ) : (
        <div className="controls__group">
          {deviceId ? (
            <>
              <SessionsPanel
                deviceId={deviceId}
                selectedSessionId={selectedSessionId}
                onSelectSessionId={onSelectSessionId}
                onStartSession={onStartSession}
              />
              {selectedSessionId ? (
                <>
                  <button
                    type="button"
                    className="controls__button"
                    onClick={() => void handleExport(selectedSessionId, setExportError, setIsExporting)}
                    disabled={isExporting}
                  >
                    {isExporting ? 'Exporting…' : 'Export GeoJSON'}
                  </button>
                  {exportError ? (
                    <div className="controls__export-error">{exportError}</div>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <span className="controls__label">Select a device</span>
          )}
        </div>
      )}

      <div className="controls__group">
        <label htmlFor="gateway-select">Gateway</label>
        <select
          id="gateway-select"
          value={selectedGatewayId ?? ''}
          onChange={(event) => onSelectGatewayId(event.target.value || null)}
          disabled={gatewayIds.length === 0}
        >
          <option value="">All gateways</option>
          {gatewayIds.map((gatewayId) => (
            <option key={gatewayId} value={gatewayId}>
              {gatewayId}
            </option>
          ))}
        </select>
      </div>

      <div className="controls__group">
        <span className="controls__label">Map</span>
        <button type="button" className="controls__button" onClick={onFitToData}>
          Fit to data
        </button>
      </div>

      <div className="controls__group">
        <span className="controls__label">Layers</span>
        <label className="controls__toggle">
          <input
            type="checkbox"
            checked={showPoints}
            onChange={(event) => onShowPointsChange(event.target.checked)}
            disabled={mapMode === 'coverage'}
          />
          Show points
        </label>
        <label className="controls__toggle">
          <input
            type="checkbox"
            checked={showTrack}
            onChange={(event) => onShowTrackChange(event.target.checked)}
          />
          Show track
        </label>
      </div>

      {(latest?.lastMeasurementAt || latest?.lastWebhookAt || latest?.lastWebhookError) && (
        <div className="controls__status" aria-live="polite">
          {latest?.lastMeasurementAt && (
            <div className="controls__status-row">
              <span>Last measurement:</span>
              <strong>{formatRelativeTime(latest.lastMeasurementAt)}</strong>
            </div>
          )}
          {(latest?.lastWebhookAt || latest?.lastWebhookError) && (
            <div
              className={`controls__status-row ${
                latest?.lastWebhookError ? 'controls__status-error' : ''
              }`}
            >
              <span>Last webhook:</span>
              <strong>
                {latest?.lastWebhookAt ? formatRelativeTime(latest.lastWebhookAt) : '—'}
                {latest?.lastWebhookError ? ` (${latest.lastWebhookError})` : ''}
              </strong>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');
  return raw;
}

async function handleExport(
  sessionId: string,
  setExportError: (value: string | null) => void,
  setIsExporting: (value: boolean) => void
): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  setExportError(null);
  setIsExporting(true);
  try {
    const apiBaseUrl = getApiBaseUrl();
    const url = `${apiBaseUrl}/api/export/session/${sessionId}.geojson`;
    const queryKey = import.meta.env.VITE_QUERY_API_KEY ?? '';
    const headers = queryKey ? { 'X-API-Key': queryKey } : undefined;
    const response = await fetch(url, { headers });
    if (response.status === 401 || response.status === 403) {
      setExportError('Export requires QUERY key');
      return;
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Export failed (${response.status})`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `session-${sessionId}.geojson`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    setExportError('Export failed');
  } finally {
    setIsExporting(false);
  }
}

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absSeconds = Math.abs(seconds);

  if (typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl) {
    const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    if (absSeconds < 60) {
      return rtf.format(seconds, 'second');
    }
    const minutes = Math.round(seconds / 60);
    if (Math.abs(minutes) < 60) {
      return rtf.format(minutes, 'minute');
    }
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) {
      return rtf.format(hours, 'hour');
    }
    const days = Math.round(hours / 24);
    return rtf.format(days, 'day');
  }

  const minutes = Math.round(absSeconds / 60);
  if (minutes < 1) {
    return `${absSeconds}s ago`;
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatDeviceLabel(name: string | null | undefined, deviceUid: string): string {
  const trimmedName = name?.trim();
  if (!trimmedName) {
    return deviceUid;
  }
  if (trimmedName.toLowerCase() === deviceUid.toLowerCase()) {
    return deviceUid;
  }
  return `${trimmedName} (${deviceUid})`;
}

function copyDeviceUid(deviceUid: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(deviceUid).catch(() => undefined);
    return;
  }
  try {
    const input = document.createElement('input');
    input.value = deviceUid;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  } catch {
    // no-op: avoid noisy errors
  }
}

type CoverageLegendItem = {
  label: string;
  bucket: 'strong' | 'medium' | 'weak' | 'unknown';
};

function CoverageLegend({ metric }: { metric: 'count' | 'rssiAvg' | 'snrAvg' }) {
  const items: CoverageLegendItem[] =
    metric === 'count'
      ? [
          { label: '1-5', bucket: 'weak' },
          { label: '6-20', bucket: 'medium' },
          { label: '21+', bucket: 'strong' }
        ]
      : metric === 'snrAvg'
        ? [
            { label: '< 5 dB', bucket: 'weak' },
            { label: '5-9 dB', bucket: 'medium' },
            { label: '>= 10 dB', bucket: 'strong' },
            { label: 'Unknown', bucket: 'unknown' }
          ]
        : [
            { label: '< -90 dBm', bucket: 'weak' },
            { label: '-90 to -71 dBm', bucket: 'medium' },
            { label: '>= -70 dBm', bucket: 'strong' },
            { label: 'Unknown', bucket: 'unknown' }
          ];

  return (
    <div className="controls__legend" aria-label="Coverage legend">
      {items.map((item) => (
        <div key={item.label} className="controls__legend-row">
          <span className={`controls__legend-swatch coverage-bin coverage-bin--${item.bucket}`} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}
