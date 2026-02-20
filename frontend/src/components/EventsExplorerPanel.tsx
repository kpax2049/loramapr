import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '../api/http';
import { useDevices } from '../query/hooks';
import { useUnifiedEvent, useUnifiedEvents } from '../query/events';
import type { UnifiedEventListItem, UnifiedEventSource } from '../api/types';

type EventsExplorerPanelProps = {
  isActive: boolean;
  hasQueryApiKey: boolean;
};

type TimePreset = 'last15m' | 'last1h' | 'last24h' | 'custom';

type EventHighlight = {
  label: string;
  value: string;
};

const AUTO_REFRESH_MS = 7000;
const DEFAULT_LIMIT = 100;
const LARGE_PAYLOAD_BYTES = 250_000;
const HUGE_PAYLOAD_BYTES = 1_000_000;
const JSON_TREE_CHILD_LIMIT = 500;

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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function collectCandidateRecords(root: unknown, maxRecords = 700): Record<string, unknown>[] {
  const stack: unknown[] = [root];
  const records: Record<string, unknown>[] = [];
  const seen = new Set<Record<string, unknown>>();

  while (stack.length > 0 && records.length < maxRecords) {
    const current = stack.pop();
    if (!current || typeof current !== 'object') {
      continue;
    }

    if (Array.isArray(current)) {
      for (let index = current.length - 1; index >= 0; index -= 1) {
        stack.push(current[index]);
      }
      continue;
    }

    const record = current as Record<string, unknown>;
    if (seen.has(record)) {
      continue;
    }
    seen.add(record);
    records.push(record);

    for (const value of Object.values(record)) {
      stack.push(value);
    }
  }

  return records;
}

function findFirstNumber(payload: unknown, keys: string[]): number | null {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  for (const record of collectCandidateRecords(payload)) {
    for (const [key, value] of Object.entries(record)) {
      if (!keySet.has(key.toLowerCase())) {
        continue;
      }
      const numeric = toFiniteNumber(value);
      if (numeric !== null) {
        return numeric;
      }
    }
  }
  return null;
}

function findFirstString(payload: unknown, keys: string[]): string | null {
  const keySet = new Set(keys.map((key) => key.toLowerCase()));
  for (const record of collectCandidateRecords(payload)) {
    for (const [key, value] of Object.entries(record)) {
      if (!keySet.has(key.toLowerCase()) || typeof value !== 'string') {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
  }
  return null;
}

function normalizeCoordinate(value: number, limit: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const absolute = Math.abs(value);
  if (absolute <= limit) {
    return value;
  }
  if (absolute <= limit * 1_000_000) {
    const scaled = value / 1_000_000;
    return Math.abs(scaled) <= limit ? scaled : null;
  }
  if (absolute <= limit * 10_000_000) {
    const scaled = value / 10_000_000;
    return Math.abs(scaled) <= limit ? scaled : null;
  }
  return null;
}

function formatNumber(value: number, digits = 1): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(digits);
}

function extractHighlights(payload: unknown): EventHighlight[] {
  const highlights: EventHighlight[] = [];

  const rxRssi = findFirstNumber(payload, ['rxRssi', 'rx_rssi', 'rssi']);
  if (rxRssi !== null) {
    highlights.push({ label: 'rxRssi', value: `${formatNumber(rxRssi)} dBm` });
  }

  const rxSnr = findFirstNumber(payload, ['rxSnr', 'rx_snr', 'snr']);
  if (rxSnr !== null) {
    highlights.push({ label: 'rxSnr', value: `${formatNumber(rxSnr)} dB` });
  }

  const hops = findFirstNumber(payload, ['hopLimit', 'hop_limit', 'hops']);
  if (hops !== null) {
    highlights.push({ label: 'hops', value: formatNumber(Math.round(hops), 0) });
  }

  const latRaw = findFirstNumber(payload, ['lat', 'latitude', 'latitudeI', 'latitude_i']);
  const lonRaw = findFirstNumber(payload, ['lon', 'lng', 'longitude', 'longitudeI', 'longitude_i']);
  const lat = latRaw === null ? null : normalizeCoordinate(latRaw, 90);
  const lon = lonRaw === null ? null : normalizeCoordinate(lonRaw, 180);
  if (lat !== null && lon !== null) {
    highlights.push({ label: 'lat/lon', value: `${lat.toFixed(6)}, ${lon.toFixed(6)}` });
  }

  const battery = findFirstNumber(payload, [
    'batteryLevel',
    'battery_level',
    'batteryPercent',
    'battery_percent',
    'battery'
  ]);
  if (battery !== null) {
    const normalizedBattery = battery <= 1 ? battery * 100 : battery;
    highlights.push({ label: 'battery', value: `${formatNumber(normalizedBattery)}%` });
  }

  const voltage = findFirstNumber(payload, ['voltage', 'batteryVoltage', 'voltageMv', 'voltage_mv']);
  if (voltage !== null) {
    const normalizedVoltage = voltage > 100 ? voltage / 1000 : voltage;
    highlights.push({ label: 'voltage', value: `${normalizedVoltage.toFixed(2)} V` });
  }

  const hwModel = findFirstString(payload, ['hwModel', 'hw_model', 'hardwareModel', 'hardware_model']);
  if (hwModel) {
    highlights.push({ label: 'hwModel', value: hwModel });
  }

  return highlights;
}

function serializePayload(payload: unknown): { text: string; bytes: number } {
  let text: string;
  try {
    const encoded = JSON.stringify(payload, null, 2);
    text = typeof encoded === 'string' ? encoded : String(payload);
  } catch {
    text = String(payload);
  }

  try {
    return { text, bytes: new TextEncoder().encode(text).length };
  } catch {
    return { text, bytes: text.length };
  }
}

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  if (!value || typeof value !== 'object') {
    return false;
  }
  return Array.isArray(value) || Boolean(toRecord(value));
}

function getContainerEntries(value: Record<string, unknown> | unknown[]): Array<[string, unknown]> {
  if (Array.isArray(value)) {
    return value.map((item, index) => [String(index), item]);
  }
  return Object.entries(value);
}

function getNodePreview(value: Record<string, unknown> | unknown[]): string {
  return Array.isArray(value) ? `[${value.length}]` : `{${Object.keys(value).length}}`;
}

function getValueClassName(value: unknown): string {
  if (value === null) {
    return 'events-json-node__value--null';
  }
  if (typeof value === 'string') {
    return 'events-json-node__value--string';
  }
  if (typeof value === 'number') {
    return 'events-json-node__value--number';
  }
  if (typeof value === 'boolean') {
    return 'events-json-node__value--boolean';
  }
  return 'events-json-node__value--other';
}

function formatPrimitiveValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value === 'undefined') {
    return 'undefined';
  }
  return String(value);
}

type JsonTreeNodeProps = {
  label: string;
  value: unknown;
  path: string;
  depth: number;
  defaultExpanded: boolean;
  expandedByPath: Record<string, boolean>;
  onToggle: (path: string) => void;
};

function JsonTreeNode({
  label,
  value,
  path,
  depth,
  defaultExpanded,
  expandedByPath,
  onToggle
}: JsonTreeNodeProps) {
  if (!isContainer(value)) {
    return (
      <div className="events-json-node events-json-node--leaf" style={{ paddingLeft: `${depth * 0.85}rem` }}>
        <span className="events-json-node__key">{label}:</span>
        <span className={`events-json-node__value ${getValueClassName(value)}`}>
          {formatPrimitiveValue(value)}
        </span>
      </div>
    );
  }

  const entries = getContainerEntries(value);
  const expanded = expandedByPath[path] ?? defaultExpanded;
  const visibleEntries = expanded ? entries.slice(0, JSON_TREE_CHILD_LIMIT) : [];
  const hiddenEntriesCount = expanded && entries.length > JSON_TREE_CHILD_LIMIT
    ? entries.length - JSON_TREE_CHILD_LIMIT
    : 0;

  return (
    <div className="events-json-node" style={{ paddingLeft: `${depth * 0.85}rem` }}>
      <button type="button" className="events-json-node__toggle" onClick={() => onToggle(path)}>
        <span className={`events-json-node__caret ${expanded ? 'is-open' : ''}`} aria-hidden="true">
          ▸
        </span>
        <span className="events-json-node__key">{label}</span>
        <span className="events-json-node__preview">{getNodePreview(value)}</span>
      </button>

      {expanded ? (
        <div className="events-json-node__children">
          {visibleEntries.map(([childKey, childValue]) => {
            const childPath = Array.isArray(value) ? `${path}[${childKey}]` : `${path}.${childKey}`;
            return (
              <JsonTreeNode
                key={childPath}
                label={Array.isArray(value) ? `[${childKey}]` : childKey}
                value={childValue}
                path={childPath}
                depth={depth + 1}
                defaultExpanded={defaultExpanded}
                expandedByPath={expandedByPath}
                onToggle={onToggle}
              />
            );
          })}
          {hiddenEntriesCount > 0 ? (
            <div className="events-json-node events-json-node--truncated" style={{ paddingLeft: `${(depth + 1) * 0.85}rem` }}>
              Showing first {JSON_TREE_CHILD_LIMIT} entries ({hiddenEntriesCount} hidden)
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

type JsonTreeViewerProps = {
  value: unknown;
  serializedPayload: string;
  defaultCollapsed: boolean;
};

function JsonTreeViewer({ value, serializedPayload, defaultCollapsed }: JsonTreeViewerProps) {
  const [defaultExpanded, setDefaultExpanded] = useState(!defaultCollapsed);
  const [expandedByPath, setExpandedByPath] = useState<Record<string, boolean>>({});
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  useEffect(() => {
    setDefaultExpanded(!defaultCollapsed);
    setExpandedByPath({});
    setCopyState('idle');
  }, [defaultCollapsed, serializedPayload]);

  const handleToggle = (path: string) => {
    setExpandedByPath((previous) => ({
      ...previous,
      [path]: !(previous[path] ?? defaultExpanded)
    }));
  };

  const handleExpandAll = () => {
    setDefaultExpanded(true);
    setExpandedByPath({});
  };

  const handleCollapseAll = () => {
    setDefaultExpanded(false);
    setExpandedByPath({});
  };

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopyState('failed');
      return;
    }

    try {
      await navigator.clipboard.writeText(serializedPayload);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="events-json-tree">
      <div className="events-json-tree__toolbar">
        <button type="button" className="events-json-tree__button" onClick={handleExpandAll}>
          Expand all
        </button>
        <button type="button" className="events-json-tree__button" onClick={handleCollapseAll}>
          Collapse all
        </button>
        <button type="button" className="events-json-tree__button" onClick={() => void handleCopy()}>
          Copy JSON
        </button>
        <span className="events-json-tree__copy-state" aria-live="polite">
          {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : ''}
        </span>
      </div>

      <div className="events-json-tree__content">
        <JsonTreeNode
          label="payloadJson"
          value={value}
          path="$"
          depth={0}
          defaultExpanded={defaultExpanded}
          expandedByPath={expandedByPath}
          onToggle={handleToggle}
        />
      </div>
    </div>
  );
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
  const [allowHugePayloadRender, setAllowHugePayloadRender] = useState(false);

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

  const payloadSerialization = useMemo(
    () => serializePayload(selectedEvent?.payloadJson),
    [selectedEvent?.id, selectedEvent?.payloadJson]
  );

  const payloadIsLarge = payloadSerialization.bytes >= LARGE_PAYLOAD_BYTES;
  const payloadIsHuge = payloadSerialization.bytes >= HUGE_PAYLOAD_BYTES;
  const payloadShouldRenderTree = !payloadIsHuge || allowHugePayloadRender;
  const highlights = useMemo(
    () => extractHighlights(selectedEvent?.payloadJson),
    [selectedEvent?.id, selectedEvent?.payloadJson]
  );

  useEffect(() => {
    setAllowHugePayloadRender(false);
  }, [selectedEventId]);

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
          {detailQuery.isLoading ? (
            <div className="events-explorer__drawer-body">Loading…</div>
          ) : detailQuery.error ? (
            <div className="events-explorer__drawer-body events-explorer__error">
              <div>Failed to load event detail: {detailQuery.error.message}</div>
              {detailRequestId ? <div>X-Request-Id: {detailRequestId}</div> : null}
            </div>
          ) : selectedEvent ? (
            <>
              <div className="events-explorer__drawer-header">
                <div className="events-explorer__drawer-header-main">
                  <h4>{selectedEvent.source.toUpperCase()} event</h4>
                  <div className="events-explorer__drawer-header-subtitle">
                    <span>{selectedEvent.deviceUid ?? 'unknown-device'}</span>
                    <span>{selectedEvent.portnum ?? 'port: —'}</span>
                    <span>{formatTimestamp(selectedEvent.receivedAt)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => setSelectedEventId(null)}>
                  Close
                </button>
              </div>

              <div className="events-explorer__drawer-body">
                <dl className="events-explorer__detail-list">
                  <dt>Packet</dt>
                  <dd>{selectedEvent.packetId ?? '—'}</dd>
                  <dt>Type</dt>
                  <dd>{selectedEvent.eventType ?? '—'}</dd>
                  <dt>Error</dt>
                  <dd>{selectedEvent.error ?? '—'}</dd>
                </dl>

                {highlights.length > 0 ? (
                  <div className="events-explorer__highlights">
                    {highlights.map((highlight) => (
                      <div key={highlight.label} className="events-explorer__highlight">
                        <span>{highlight.label}</span>
                        <strong>{highlight.value}</strong>
                      </div>
                    ))}
                  </div>
                ) : null}

                {payloadIsHuge && !allowHugePayloadRender ? (
                  <div className="events-explorer__payload-warning">
                    <p>
                      Payload is large ({Math.round(payloadSerialization.bytes / 1024)} KB). Tree rendering is
                      disabled by default.
                    </p>
                    <button type="button" onClick={() => setAllowHugePayloadRender(true)}>
                      Render payload tree
                    </button>
                  </div>
                ) : null}

                {payloadShouldRenderTree ? (
                  <JsonTreeViewer
                    key={selectedEvent.id}
                    value={selectedEvent.payloadJson}
                    serializedPayload={payloadSerialization.text}
                    defaultCollapsed={payloadIsLarge || payloadIsHuge}
                  />
                ) : null}
              </div>
            </>
          ) : (
            <div className="events-explorer__drawer-body">No detail available.</div>
          )}
        </aside>
      ) : null}
    </section>
  );
}
