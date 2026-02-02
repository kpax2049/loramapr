import { useEffect } from 'react';
import { useDeviceLatest, useDevices } from '../query/hooks';
import SessionsPanel from './SessionsPanel';

type ControlsProps = {
  deviceId: string | null;
  onDeviceChange: (deviceId: string | null) => void;
  filterMode: 'time' | 'session';
  onFilterModeChange: (mode: 'time' | 'session') => void;
  selectedSessionId: string | null;
  onSelectSessionId: (sessionId: string | null) => void;
  gatewayIds: string[];
  selectedGatewayId: string | null;
  onSelectGatewayId: (gatewayId: string | null) => void;
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
  gatewayIds,
  selectedGatewayId,
  onSelectGatewayId,
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
  const { data: latest } = useDeviceLatest(deviceId ?? undefined);

  useEffect(() => {
    if (!deviceId && devices.length > 0) {
      onDeviceChange(devices[0].id);
    }
  }, [deviceId, devices, onDeviceChange]);

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
              {device.name ?? device.deviceUid}
            </option>
          ))}
        </select>
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
            <SessionsPanel
              deviceId={deviceId}
              selectedSessionId={selectedSessionId}
              onSelectSessionId={onSelectSessionId}
            />
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
        <span className="controls__label">Layers</span>
        <label className="controls__toggle">
          <input
            type="checkbox"
            checked={showPoints}
            onChange={(event) => onShowPointsChange(event.target.checked)}
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
