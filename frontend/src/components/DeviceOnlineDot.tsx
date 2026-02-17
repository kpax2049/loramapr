import {
  getDeviceOnlineStatuses,
  type DeviceStatusBucket
} from '../utils/deviceOnlineStatus';

type DeviceOnlineDotProps = {
  latestMeasurementAt?: string | null;
  latestWebhookReceivedAt?: string | null;
  latestWebhookSource?: string | null;
  formatRelativeTime?: (value: string) => string;
  className?: string;
  size?: number;
  dataTour?: string;
};

const STATUS_RANK: Record<DeviceStatusBucket, number> = {
  unknown: 0,
  offline: 1,
  stale: 2,
  recent: 3,
  online: 4
};

function formatDefaultRelativeTime(value: string): string {
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

function formatLast(value: string | null | undefined, formatRelativeTime?: (value: string) => string): string {
  if (!value) {
    return 'never';
  }
  const formatter = formatRelativeTime ?? formatDefaultRelativeTime;
  return formatter(value);
}

export default function DeviceOnlineDot({
  latestMeasurementAt = null,
  latestWebhookReceivedAt = null,
  latestWebhookSource = null,
  formatRelativeTime,
  className,
  size = 12,
  dataTour
}: DeviceOnlineDotProps) {
  const { measurementStatus, webhookStatus } = getDeviceOnlineStatuses({
    latestMeasurementAt,
    latestWebhookReceivedAt
  });
  const measurementRank = STATUS_RANK[measurementStatus];
  const webhookRank = STATUS_RANK[webhookStatus];
  const webhookHasSignal = webhookStatus === 'online' || webhookStatus === 'recent' || webhookStatus === 'stale';
  const showRing = webhookHasSignal && webhookRank > measurementRank;
  const showPulse = measurementStatus === 'online';

  const ingestSource = latestWebhookSource?.trim() ? latestWebhookSource : 'unknown';
  const tooltip = [
    `Measurements: ${measurementStatus} (last: ${formatLast(latestMeasurementAt, formatRelativeTime)})`,
    `Ingest: ${webhookStatus} (${ingestSource}) (last: ${formatLast(
      latestWebhookReceivedAt,
      formatRelativeTime
    )})`
  ].join('\n');

  const classes = [
    'device-online-dot',
    `device-online-dot--measurement-${measurementStatus}`,
    showRing ? `device-online-dot--ring-${webhookStatus}` : '',
    showPulse ? 'device-online-dot--pulse' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span
      className={classes}
      style={{ ['--device-online-dot-size' as const]: `${size}px` }}
      title={tooltip}
      aria-label={tooltip}
      data-tour={dataTour}
    >
      {showRing ? <span className="device-online-dot__ring" aria-hidden="true" /> : null}
      <span className="device-online-dot__core" aria-hidden="true" />
    </span>
  );
}
