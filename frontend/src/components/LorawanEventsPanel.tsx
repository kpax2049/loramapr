import { useLorawanEvents } from '../query/lorawan';

type LorawanEventsPanelProps = {
  deviceUid?: string;
};

function truncate(value: string | null | undefined, length = 12): string {
  if (!value) {
    return '—';
  }
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length)}…`;
}

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

export default function LorawanEventsPanel({ deviceUid }: LorawanEventsPanelProps) {
  const { data: events = [], isLoading, refetch } = useLorawanEvents(deviceUid, 50);

  return (
    <section className="lorawan-panel" aria-label="LoRaWAN events">
      <div className="lorawan-panel__header">
        <h3>LoRaWAN events</h3>
        <button type="button" onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {events.length === 0 && !isLoading ? (
        <div className="lorawan-panel__empty">No events</div>
      ) : (
        <div className="lorawan-panel__table-wrapper">
          <table className="lorawan-panel__table">
            <thead>
              <tr>
                <th>Received</th>
                <th>Processed</th>
                <th>Device</th>
                <th>Error</th>
                <th>Uplink</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{formatTimestamp(event.receivedAt)}</td>
                  <td>{formatTimestamp(event.processedAt)}</td>
                  <td>{event.deviceUid ?? '—'}</td>
                  <td>{event.processingError ?? '—'}</td>
                  <td>{truncate(event.uplinkId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
