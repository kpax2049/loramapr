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
      <span className="status-strip__item">Device {deviceLabel}</span>
      {latestMeasurementAt ? (
        <span className="status-strip__item">
          Last measurement {formatRelativeTime(latestMeasurementAt)}
        </span>
      ) : null}
      {latestWebhookSource || latestWebhookReceivedAt ? (
        <span className="status-strip__item">
          Webhook {latestWebhookSource ?? 'unknown'}
          {latestWebhookReceivedAt ? ` @ ${formatRelativeTime(latestWebhookReceivedAt)}` : ''}
        </span>
      ) : null}
      {activeSessionId ? (
        <span className="status-strip__item">Session {shortenId(activeSessionId)}</span>
      ) : null}
    </div>
  );
}
