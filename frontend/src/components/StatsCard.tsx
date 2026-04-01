import type { StatsResponse } from '../api/endpoints';

type StatsCardProps = {
  stats?: StatsResponse;
  isLoading: boolean;
  error?: Error | null;
};

function formatTimestamp(value: string | null | undefined): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

export default function StatsCard({ stats, isLoading, error }: StatsCardProps) {
  return (
    <section className="stats-card" aria-label="Measurement stats">
      <header className="stats-card__header">
        <h3>Stats</h3>
      </header>
      {isLoading && <p className="stats-card__status">Loading…</p>}
      {error && <p className="stats-card__error">Failed to load stats.</p>}
      {!isLoading && !error && !stats && (
        <p className="stats-card__status">No data yet.</p>
      )}
      {!isLoading && !error && stats && (
        <dl className="stats-card__grid">
          <div>
            <dt>Measurements</dt>
            <dd>{stats.count}</dd>
          </div>
          <div>
            <dt>First</dt>
            <dd>{formatTimestamp(stats.minCapturedAt)}</dd>
          </div>
          <div>
            <dt>Last</dt>
            <dd>{formatTimestamp(stats.maxCapturedAt)}</dd>
          </div>
          <div>
            <dt>Gateways</dt>
            <dd>{stats.gatewayCount}</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
