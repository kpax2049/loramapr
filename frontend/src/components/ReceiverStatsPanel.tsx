type ReceiverStatsPanelProps = {
  receiverId: string | null;
  count: number | null;
  lastSeenAt: string | null;
};

export default function ReceiverStatsPanel({ receiverId, count, lastSeenAt }: ReceiverStatsPanelProps) {
  if (!receiverId) {
    return null;
  }

  const lastSeenLabel = lastSeenAt ? formatRelativeTime(lastSeenAt) : '—';

  return (
    <section className="stats-card">
      <h3>Receiver Stats</h3>
      <dl className="stats-card__grid">
        <div>
          <dt>Receiver</dt>
          <dd>{receiverId}</dd>
        </div>
        <div>
          <dt>Count</dt>
          <dd>{typeof count === 'number' ? count : '—'}</dd>
        </div>
        <div>
          <dt>Last seen</dt>
          <dd>{lastSeenLabel}</dd>
        </div>
      </dl>
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
