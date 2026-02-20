import { useMemo, useState } from 'react';
import { ApiError } from '../api/http';
import { useDevices } from '../query/hooks';
import { useUnifiedEvent, useUnifiedEvents } from '../query/events';
import type { UnifiedEventListItem, UnifiedEventSource } from '../api/types';

type EventsExplorerPanelProps = {
  isActive: boolean;
  hasQueryApiKey: boolean;
};

type TimePreset = 'last15m' | 'last1h' | 'last24h' | 'custom';

const AUTO_REFRESH_MS = 7000;
const DEFAULT_LIMIT = 100;

const SOURCE_OPTIONS: Array<{ value: '' | UnifiedEventSource; label: string }> = [
  { value: '', label: 'All sources' },
  { value: 'lorawan', label: 'LoRaWAN' },
  { value: 'meshtastic', label: 'Meshtastic' },
  { value: 'agent', label: 'Agent' },
  { value: 'sim', label: 'Sim' }
];

const TIME_PRESETS: Array<{ value: TimePreset; label: string }> = [
  { value: 'last15m', label: 'Last 15m' },
  { value: 'last1h', label: 'Last 1h' },
  { value: 'last24h', label: 'Last 24h' },
  { value: 'custom', label: 'Custom' }
];

function trimOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseLocalDateTime(value: string): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

function buildSummary(item: UnifiedEventListItem): string {
  const parts: string[] = [];
  if (item.packetId) {
    parts.push(`pkt ${item.packetId.slice(0, 8)}`);
  }
  if (typeof item.lat === 'number' && typeof item.lon === 'number') {
    parts.push(`pos ${item.lat.toFixed(4)},${item.lon.toFixed(4)}`);
  }
  if (typeof item.hopLimit === 'number') {
    parts.push(`hop ${item.hopLimit}`);
  }
  if (item.transportMechanism) {
    parts.push(item.transportMechanism);
  }
  if (item.relayNode) {
    parts.push(`relay ${item.relayNode}`);
  }
  return parts.length > 0 ? parts.join(' · ') : '—';
}

function buildRequestId(error: unknown): string | null {
  if (error instanceof ApiError && error.requestId) {
    return error.requestId;
  }
  if (
    typeof error === 'object' &&
    error &&
    'details' in error &&
    typeof (error as { details?: unknown }).details === 'object' &&
    (error as { details?: { requestId?: unknown } }).details &&
    typeof (error as { details?: { requestId?: unknown } }).details?.requestId === 'string'
  ) {
    return (error as { details?: { requestId?: string } }).details?.requestId ?? null;
  }
  return null;
}

export default function EventsExplorerPanel({ isActive, hasQueryApiKey }: EventsExplorerPanelProps) {
  const [source, setSource] = useState<'' | UnifiedEventSource>('');
  const [deviceUidInput, setDeviceUidInput] = useState('');
  const [portnumInput, setPortnumInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [timePreset, setTimePreset] = useState<TimePreset>('last1h');
  const [customSince, setCustomSince] = useState('');
  const [customUntil, setCustomUntil] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const devicesQuery = useDevices(false, { enabled: isActive && hasQueryApiKey });
  const knownDevices = devicesQuery.data?.items ?? [];
  const isSmallRange = timePreset === 'last15m' || timePreset === 'last1h';
  const refreshInterval = isActive && hasQueryApiKey && isSmallRange ? AUTO_REFRESH_MS : false;
  const refreshEnabled = typeof refreshInterval === 'number';

  const range = useMemo(() => {
    const now = Date.now();
    if (timePreset === 'last15m') {
      return { since: new Date(now - 15 * 60_000), until: undefined as Date | undefined };
    }
    if (timePreset === 'last1h') {
      return { since: new Date(now - 60 * 60_000), until: undefined as Date | undefined };
    }
    if (timePreset === 'last24h') {
      return { since: new Date(now - 24 * 60 * 60_000), until: undefined as Date | undefined };
    }

    const since = parseLocalDateTime(customSince);
    const until = parseLocalDateTime(customUntil);
    return {
      since: since ?? undefined,
      until: until ?? undefined
    };
  }, [timePreset, customSince, customUntil]);

  const customRangeInvalid =
    timePreset === 'custom' &&
    Boolean(range.since && range.until && range.since.getTime() > range.until.getTime());

  const filters = useMemo(
    () => ({
      source: source || undefined,
      deviceUid: trimOptional(deviceUidInput),
      portnum: trimOptional(portnumInput),
      q: trimOptional(searchQuery),
      since: range.since,
      until: range.until
    }),
    [source, deviceUidInput, portnumInput, searchQuery, range.since, range.until]
  );

  const eventsQuery = useUnifiedEvents(filters, {
    enabled: isActive && hasQueryApiKey && !customRangeInvalid,
    limit: DEFAULT_LIMIT,
    refetchInterval: refreshInterval
  });

  const detailQuery = useUnifiedEvent(
    selectedEventId,
    isActive && hasQueryApiKey && Boolean(selectedEventId)
  );

  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [eventsQuery.data]
  );

  const portnumOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of events) {
      if (item.portnum) {
        values.add(item.portnum);
      }
    }
    return Array.from(values.values()).sort((a, b) => a.localeCompare(b));
  }, [events]);

  const requestId = buildRequestId(eventsQuery.error);
  const selectedEvent = detailQuery.data;
  const detailRequestId = buildRequestId(detailQuery.error);

  return (
    <section className="events-explorer" aria-label="Unified events explorer">
      <div className="events-explorer__header">
        <h3>Events</h3>
      </div>

      {!hasQueryApiKey ? (
        <div className="events-explorer__message">Events requires QUERY key.</div>
      ) : (
        <>
          <div className="events-explorer__filters">
            <label>
              Source
              <select
                value={source}
                onChange={(event) => setSource(event.target.value as '' | UnifiedEventSource)}
              >
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Device
              <input
                list="events-device-options"
                value={deviceUidInput}
                onChange={(event) => setDeviceUidInput(event.target.value)}
                placeholder="deviceUid"
              />
            </label>
            <label>
              Portnum
              <input
                list="events-portnum-options"
                value={portnumInput}
                onChange={(event) => setPortnumInput(event.target.value)}
                placeholder="portnum"
              />
            </label>
            <label>
              Time range
              <select
                value={timePreset}
                onChange={(event) => setTimePreset(event.target.value as TimePreset)}
              >
                {TIME_PRESETS.map((preset) => (
                  <option key={preset.value} value={preset.value}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Search
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="q"
              />
            </label>
          </div>

          {timePreset === 'custom' ? (
            <div className="events-explorer__filters events-explorer__filters--custom">
              <label>
                Since
                <input
                  type="datetime-local"
                  value={customSince}
                  onChange={(event) => setCustomSince(event.target.value)}
                />
              </label>
              <label>
                Until
                <input
                  type="datetime-local"
                  value={customUntil}
                  onChange={(event) => setCustomUntil(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          {customRangeInvalid ? (
            <div className="events-explorer__error">Custom range is invalid (since must be before until).</div>
          ) : null}

          {eventsQuery.error ? (
            <div className="events-explorer__error">
              <div>Failed to load events: {eventsQuery.error.message}</div>
              {requestId ? <div>X-Request-Id: {requestId}</div> : null}
            </div>
          ) : null}

          <div className="events-explorer__table-wrap">
            <table className="events-explorer__table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Source</th>
                  <th>Device</th>
                  <th>Portnum</th>
                  <th>rxRssi</th>
                  <th>rxSnr</th>
                  <th>Summary</th>
                </tr>
              </thead>
              <tbody>
                {events.map((item) => (
                  <tr
                    key={item.id}
                    className={`events-explorer__row ${selectedEventId === item.id ? 'is-selected' : ''}`}
                    onClick={() => setSelectedEventId(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        setSelectedEventId(item.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open event ${item.id}`}
                  >
                    <td>{formatTimestamp(item.receivedAt)}</td>
                    <td>{item.source}</td>
                    <td>{item.deviceUid ?? '—'}</td>
                    <td>{item.portnum ?? '—'}</td>
                    <td>{item.rxRssi ?? '—'}</td>
                    <td>{item.rxSnr ?? '—'}</td>
                    <td>{buildSummary(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!eventsQuery.isLoading && events.length === 0 ? (
              <div className="events-explorer__empty">No events found for current filters.</div>
            ) : null}
          </div>

          <div className="events-explorer__footer">
            <button
              type="button"
              className="controls__button controls__button--compact"
              onClick={() => void eventsQuery.fetchNextPage()}
              disabled={!eventsQuery.hasNextPage || eventsQuery.isFetchingNextPage}
            >
              {eventsQuery.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
            <span className="events-explorer__meta">
              {eventsQuery.isFetching && !eventsQuery.isFetchingNextPage ? 'Refreshing…' : null}
              {eventsQuery.isFetching && !eventsQuery.isFetchingNextPage ? ' ' : null}
              {refreshEnabled
                ? `Auto-refresh ${Math.round(AUTO_REFRESH_MS / 1000)}s`
                : 'Auto-refresh off for 24h/custom'}
            </span>
          </div>
        </>
      )}

      <datalist id="events-device-options">
        {knownDevices.map((device) => (
          <option
            key={device.id}
            value={device.deviceUid}
            label={device.name ?? device.longName ?? device.deviceUid}
          />
        ))}
      </datalist>
      <datalist id="events-portnum-options">
        {portnumOptions.map((portnum) => (
          <option key={portnum} value={portnum} />
        ))}
      </datalist>

      {selectedEventId ? (
        <aside className="events-explorer__drawer" aria-label="Event detail">
          <div className="events-explorer__drawer-header">
            <h4>Event detail</h4>
            <button type="button" onClick={() => setSelectedEventId(null)}>
              Close
            </button>
          </div>
          {detailQuery.isLoading ? (
            <div className="events-explorer__drawer-body">Loading…</div>
          ) : detailQuery.error ? (
            <div className="events-explorer__drawer-body events-explorer__error">
              <div>Failed to load event detail: {detailQuery.error.message}</div>
              {detailRequestId ? <div>X-Request-Id: {detailRequestId}</div> : null}
            </div>
          ) : selectedEvent ? (
            <div className="events-explorer__drawer-body">
              <dl className="events-explorer__detail-list">
                <dt>Time</dt>
                <dd>{formatTimestamp(selectedEvent.receivedAt)}</dd>
                <dt>Source</dt>
                <dd>{selectedEvent.source}</dd>
                <dt>Device</dt>
                <dd>{selectedEvent.deviceUid ?? '—'}</dd>
                <dt>Portnum</dt>
                <dd>{selectedEvent.portnum ?? '—'}</dd>
                <dt>Packet</dt>
                <dd>{selectedEvent.packetId ?? '—'}</dd>
                <dt>Type</dt>
                <dd>{selectedEvent.eventType ?? '—'}</dd>
                <dt>Error</dt>
                <dd>{selectedEvent.error ?? '—'}</dd>
              </dl>
              <pre className="events-explorer__payload">
                {JSON.stringify(selectedEvent.payloadJson, null, 2)}
              </pre>
            </div>
          ) : (
            <div className="events-explorer__drawer-body">No detail available.</div>
          )}
        </aside>
      ) : null}
    </section>
  );
}
