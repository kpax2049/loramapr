import { useMemo } from 'react';
import { useGatewayStats } from '../query/hooks';

type GatewayStatsPanelProps = {
  gatewayId?: string | null;
  scope: {
    deviceId?: string;
    sessionId?: string;
    from?: string;
    to?: string;
  };
  enabled?: boolean;
};

export default function GatewayStatsPanel({ gatewayId, scope, enabled }: GatewayStatsPanelProps) {
  const statsQuery = useGatewayStats(gatewayId, scope, { enabled });
  const stats = statsQuery.data;

  const rows = useMemo(() => {
    if (!stats) {
      return [];
    }
    return [
      { label: 'Count', value: stats.count.toString() },
      { label: 'RSSI min', value: formatNumber(stats.rssi.min) },
      { label: 'RSSI avg', value: formatNumber(stats.rssi.avg) },
      { label: 'RSSI max', value: formatNumber(stats.rssi.max) },
      { label: 'SNR min', value: formatNumber(stats.snr.min) },
      { label: 'SNR avg', value: formatNumber(stats.snr.avg) },
      { label: 'SNR max', value: formatNumber(stats.snr.max) },
      { label: 'Last seen', value: formatTimestamp(stats.lastSeenAt) }
    ];
  }, [stats]);

  if (!gatewayId) {
    return null;
  }

  return (
    <section className="gateway-stats" aria-label="Gateway stats">
      <h3>Gateway stats</h3>
      {statsQuery.isLoading ? (
        <div className="gateway-stats__empty">Loading…</div>
      ) : statsQuery.isError ? (
        <div className="gateway-stats__empty">Unable to load gateway stats</div>
      ) : (
        <dl className="gateway-stats__list">
          {rows.map((row) => (
            <div key={row.label} className="gateway-stats__row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function formatNumber(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  if (!Number.isFinite(value)) {
    return '—';
  }
  const rounded = Math.round(value * 10) / 10;
  return rounded.toString();
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}
