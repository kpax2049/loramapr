import { useEffect } from 'react';
import { useDevices } from '../query/hooks';

type ControlsProps = {
  deviceId: string | null;
  onDeviceChange: (deviceId: string | null) => void;
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
    </section>
  );
}
