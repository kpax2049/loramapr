type StatusStripProps = {
  deviceLabel: string;
  latestMeasurementAt: string | null;
  latestWebhookSource: string | null;
  latestWebhookReceivedAt: string | null;
  activeSessionId: string | null;
  formatRelativeTime: (value: string) => string;
  showThemeSwitcher?: boolean;
  themeMode?: 'system' | 'light' | 'dark';
  onThemeModeChange?: (mode: 'system' | 'light' | 'dark') => void;
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
  formatRelativeTime,
  showThemeSwitcher = false,
  themeMode = 'system',
  onThemeModeChange
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
      {showThemeSwitcher && onThemeModeChange ? (
        <span className="status-strip__item status-strip__item--theme">
          <label className="status-strip__label" htmlFor="status-strip-theme-mode">
            Theme
          </label>
          <select
            id="status-strip-theme-mode"
            className="status-strip__theme-select"
            aria-label="Theme mode"
            value={themeMode}
            onChange={(event) =>
              onThemeModeChange(event.target.value as 'system' | 'light' | 'dark')
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </span>
      ) : null}
    </div>
  );
}
