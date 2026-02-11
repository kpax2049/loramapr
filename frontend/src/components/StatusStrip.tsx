type StatusStripProps = {
  deviceLabel: string;
  latestMeasurementAt: string | null;
  latestWebhookSource: string | null;
  latestWebhookReceivedAt: string | null;
  activeSessionId: string | null;
  formatRelativeTime: (value: string) => string;
};

function shortenId(value: string): string {
  if (value.length <= 10) {
    return value;
  }
  return `${value.slice(0, 8)}…`;
}

export default function StatusStrip({
  deviceLabel,
  latestMeasurementAt,
  latestWebhookSource,
  latestWebhookReceivedAt,
  activeSessionId,
  formatRelativeTime
}: StatusStripProps) {
  return (
    <div className="status-strip" aria-live="polite">
      <span className="status-strip__item">
        <span className="status-strip__label">Device</span>
        <span className="status-strip__value">{deviceLabel}</span>
      </span>
      {latestMeasurementAt ? (
        <span className="status-strip__item">
          <span className="status-strip__label">Last measurement</span>
          <span className="status-strip__value">{formatRelativeTime(latestMeasurementAt)}</span>
        </span>
      ) : null}
      {latestWebhookSource || latestWebhookReceivedAt ? (
        <span className="status-strip__item">
          <span className="status-strip__label">Webhook</span>
          <span className="status-strip__value">
            {latestWebhookSource ?? 'unknown'}
            {latestWebhookReceivedAt ? ` @ ${formatRelativeTime(latestWebhookReceivedAt)}` : ''}
          </span>
        </span>
      ) : null}
      {activeSessionId ? (
        <span className="status-strip__item">
          <span className="status-strip__label">Session</span>
          <span className="status-strip__value">{shortenId(activeSessionId)}</span>
        </span>
      ) : null}
    </div>
  );
}
