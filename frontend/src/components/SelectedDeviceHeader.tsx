import type { Device } from '../api/types';
import { IconArrowsMinimize, IconCopy } from '@tabler/icons-react';
import { useAutoSession } from '../query/hooks';
import { useSessions } from '../query/sessions';
import DeviceOnlineDot from './DeviceOnlineDot';
import DeviceIcon, {
  getDeviceIconDefinition,
  getDevicePrimaryLabel,
  getEffectiveIconKey
} from './DeviceIcon';

type SelectedDeviceHeaderProps = {
  device: Device | null;
  latestMeasurementAt?: string | null;
  latestWebhookReceivedAt?: string | null;
  latestWebhookSource?: string | null;
  onFitToData?: () => void;
  fitFeedback?: string | null;
};

function truncateDeviceUid(deviceUid: string, maxLength = 20): string {
  if (deviceUid.length <= maxLength) {
    return deviceUid;
  }
  const head = deviceUid.slice(0, 8);
  const tail = deviceUid.slice(-6);
  return `${head}...${tail}`;
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error === 'object' && error && 'status' in error) {
    const status = (error as { status?: number }).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
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
    // no-op
  }
}

export default function SelectedDeviceHeader({
  device,
  latestMeasurementAt = null,
  latestWebhookReceivedAt = null,
  latestWebhookSource = null,
  onFitToData,
  fitFeedback
}: SelectedDeviceHeaderProps) {
  const deviceId = device?.id ?? undefined;
  const sessionsQuery = useSessions(deviceId, { enabled: Boolean(deviceId) });
  const autoSessionQuery = useAutoSession(deviceId, { enabled: Boolean(deviceId), retry: false });
  const autoSessionStatus = getErrorStatus(autoSessionQuery.error);
  const activeSession = sessionsQuery.data?.items.find((session) => session.endedAt == null) ?? null;
  const showAutoSessionBadge =
    autoSessionStatus !== 401 && autoSessionStatus !== 403 && autoSessionQuery.data?.enabled === true;

  const deviceName = getDevicePrimaryLabel(device ?? {});
  const deviceUid = device?.deviceUid ?? null;
  const iconKey = getEffectiveIconKey(device ?? {});
  const iconDefinition = getDeviceIconDefinition(iconKey);
  const sessionStatus = device ? (activeSession ? 'active' : 'idle') : null;
  const copyTitle = deviceUid ? 'Copy device UID' : 'Select a device first';
  const fitTitle = deviceUid ? 'Recenter map to visible data' : 'Select a device first';

  return (
    <div className="selected-device-header" data-tour="selected-device-header">
      <div className="selected-device-header__row">
        <div className="selected-device-header__identity-wrap minw0">
          <DeviceIcon
            device={device ?? {}}
            iconKey={iconKey}
            className="selected-device-header__icon"
            size={17}
            showBadge={Boolean(device)}
            title={iconDefinition.label}
          />
          <div className="selected-device-header__identity flex1 minw0">
            <div className="selected-device-header__name-row minw0">
              <DeviceOnlineDot
                latestMeasurementAt={latestMeasurementAt}
                latestWebhookReceivedAt={latestWebhookReceivedAt}
                latestWebhookSource={latestWebhookSource}
                className="selected-device-header__online-dot"
                dataTour="device-online-dot"
              />
              <strong className="flex1 minw0">{deviceName}</strong>
            </div>
            <span className="selected-device-header__uid-row">
              {deviceUid ? (
                <span title={deviceUid}>{truncateDeviceUid(deviceUid)}</span>
              ) : (
                <span>select a device</span>
              )}
            </span>
          </div>
        </div>
        <div className="selected-device-header__meta">
          <div className="selected-device-header__tools">
            <button
              type="button"
              className="selected-device-header__tool-button"
              disabled={!deviceUid}
              onClick={() => deviceUid && copyDeviceUid(deviceUid)}
              title={copyTitle}
              aria-label="Copy device UID"
            >
              <IconCopy className="selected-device-header__tool-icon" size={14} stroke={1.9} aria-hidden="true" />
            </button>
            {onFitToData ? (
              <button
                type="button"
                className="selected-device-header__tool-button"
                disabled={!deviceUid}
                onClick={onFitToData}
                title={fitTitle}
                aria-label="Recenter map to visible data"
                data-tour="fit-to-data"
              >
                <IconArrowsMinimize
                  className="selected-device-header__tool-icon"
                  size={14}
                  stroke={1.9}
                  aria-hidden="true"
                />
              </button>
            ) : null}
          </div>
          <div className="selected-device-header__badges">
          {sessionStatus ? (
            <span
              className={`selected-device-header__badge selected-device-header__badge--session selected-device-header__badge--session-${sessionStatus}`}
              aria-live="polite"
            >
              {sessionStatus === 'active' ? 'Run active' : 'Run idle'}
            </span>
          ) : null}
          {showAutoSessionBadge ? (
            <span className="selected-device-header__badge">Home Auto Session (HAS) enabled</span>
          ) : null}
          </div>
        </div>
      </div>
      {fitFeedback ? (
        <div className="selected-device-header__feedback" role="status" aria-live="polite">
          {fitFeedback}
        </div>
      ) : null}
    </div>
  );
}
