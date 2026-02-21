import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { List, type RowComponentProps } from 'react-window';
import { getUnifiedEventById } from '../api/endpoints';
import { ApiError } from '../api/http';
import { useDevices } from '../query/hooks';
import { useUnifiedEvent, useUnifiedEvents } from '../query/events';
import type { UnifiedEventDetail, UnifiedEventListItem, UnifiedEventSource } from '../api/types';
import { applyEventsNavigationParams, readEventsNavigationParams } from '../utils/eventsNavigation';
import type { EventsNavigationInput } from '../utils/eventsNavigation';

type EventsExplorerPanelProps = {
  isActive: boolean;
  hasQueryApiKey: boolean;
  navigationNonce: number;
  navigationRequest: EventsNavigationInput | null;
  onSelectEventForMap?: (event: UnifiedEventListItem) => void;
  onDeviceFilterChange?: (deviceUid: string | null) => void;
};

type TimePreset = 'last15m' | 'last1h' | 'last24h' | 'custom';

type EventHighlight = {
  label: string;
  value: string;
};

type EventsQuickFilters = {
  hasGps: boolean;
  hasRx: boolean;
  hasTelemetry: boolean;
  hasNodeInfo: boolean;
};

type StoredEventsFilters = {
  source: '' | UnifiedEventSource;
  deviceUidInput: string;
  portnumInput: string;
  searchQuery: string;
  timePreset: TimePreset;
  customSince: string;
  customUntil: string;
  quickFilters: EventsQuickFilters;
};

type SavedEventsView = {
  id: string;
  name: string;
  filters: StoredEventsFilters;
  createdAt: string;
  updatedAt: string;
};

const AUTO_REFRESH_MS = 7000;
const DEFAULT_LIMIT = 100;
const EVENT_ROW_HEIGHT = 30;
const EVENT_LIST_HEIGHT = 208;
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

const EVENT_COLUMN_HEADERS = ['Time', 'Source', 'Device', 'Portnum', 'rxRssi', 'rxSnr', 'Summary'] as const;
const EVENTS_FILTERS_STORAGE_KEY = 'eventsExplorer:lastFilters:v1';
const EVENTS_SAVED_VIEWS_STORAGE_KEY = 'eventsExplorer:savedViews:v1';
const QUICK_PORTNUM_CHIPS = ['POSITION_APP', 'TELEMETRY_APP', 'NODEINFO_APP'] as const;
const DEFAULT_QUICK_FILTERS: EventsQuickFilters = {
  hasGps: false,
  hasRx: false,
  hasTelemetry: false,
  hasNodeInfo: false
};

function trimOptional(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizePortnumValue(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toUpperCase();
}

function buildStoredFilters(input: Partial<StoredEventsFilters>): StoredEventsFilters {
  return {
    source:
      input.source === 'lorawan' ||
      input.source === 'meshtastic' ||
      input.source === 'agent' ||
      input.source === 'sim'
        ? input.source
        : '',
    deviceUidInput: typeof input.deviceUidInput === 'string' ? input.deviceUidInput : '',
    portnumInput: typeof input.portnumInput === 'string' ? input.portnumInput : '',
    searchQuery: typeof input.searchQuery === 'string' ? input.searchQuery : '',
    timePreset:
      input.timePreset === 'last15m' ||
      input.timePreset === 'last1h' ||
      input.timePreset === 'last24h' ||
      input.timePreset === 'custom'
        ? input.timePreset
        : 'last1h',
    customSince: typeof input.customSince === 'string' ? input.customSince : '',
    customUntil: typeof input.customUntil === 'string' ? input.customUntil : '',
    quickFilters: {
      hasGps: Boolean(input.quickFilters?.hasGps),
      hasRx: Boolean(input.quickFilters?.hasRx),
      hasTelemetry: Boolean(input.quickFilters?.hasTelemetry),
      hasNodeInfo: Boolean(input.quickFilters?.hasNodeInfo)
    }
  };
}

function readStoredEventsFilters(): StoredEventsFilters | null {
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(EVENTS_FILTERS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredEventsFilters>;
    return buildStoredFilters(parsed);
  } catch {
    return null;
  }
}

function writeStoredEventsFilters(filters: StoredEventsFilters): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(EVENTS_FILTERS_STORAGE_KEY, JSON.stringify(filters));
}

function readSavedEventsViews(): SavedEventsView[] {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(EVENTS_SAVED_VIEWS_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null;
        }
        const view = entry as Partial<SavedEventsView>;
        if (typeof view.id !== 'string' || typeof view.name !== 'string' || !view.filters) {
          return null;
        }
        return {
          id: view.id,
          name: view.name,
          filters: buildStoredFilters(view.filters),
          createdAt: typeof view.createdAt === 'string' ? view.createdAt : new Date().toISOString(),
          updatedAt: typeof view.updatedAt === 'string' ? view.updatedAt : new Date().toISOString()
        } satisfies SavedEventsView;
      })
      .filter((view): view is SavedEventsView => view !== null);
  } catch {
    return [];
  }
}

function writeSavedEventsViews(views: SavedEventsView[]): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(EVENTS_SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views));
}

function hasEventNavigationInput(input: EventsNavigationInput | null, parsed: ReturnType<typeof readEventsNavigationParams>): boolean {
  if (input) {
    return true;
  }
  return Boolean(parsed.source || parsed.deviceUid || parsed.portnum || parsed.q || parsed.from || parsed.to || parsed.eventId);
}

function matchesQuickFilters(item: UnifiedEventListItem, quickFilters: EventsQuickFilters): boolean {
  if (quickFilters.hasRx) {
    const hasRx = item.rxRssi !== null || item.rxSnr !== null;
    if (!hasRx) {
      return false;
    }
  }

  const contentChecks: boolean[] = [];
  if (quickFilters.hasGps) {
    contentChecks.push(typeof item.lat === 'number' && Number.isFinite(item.lat) && typeof item.lon === 'number' && Number.isFinite(item.lon));
  }
  if (quickFilters.hasTelemetry) {
    contentChecks.push(normalizePortnumValue(item.portnum) === 'TELEMETRY_APP');
  }
  if (quickFilters.hasNodeInfo) {
    contentChecks.push(normalizePortnumValue(item.portnum) === 'NODEINFO_APP');
  }

  if (contentChecks.length === 0) {
    return true;
  }
  return contentChecks.some(Boolean);
}

function normalizeInputText(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function formatDevicePickerLabel(name: string | null, longName: string | null, deviceUid: string): string {
  const preferred = normalizeInputText(name) || normalizeInputText(longName);
  if (preferred && preferred !== deviceUid) {
    return `${preferred} (${deviceUid})`;
  }
  return deviceUid;
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

function toDateTimeLocalValue(value: string | undefined): string {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(
    parsed.getHours()
  )}:${pad(parsed.getMinutes())}`;
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

type EventVirtualRowProps = {
  events: UnifiedEventListItem[];
  selectedEventId: string | null;
  onSelectEvent: (event: UnifiedEventListItem) => void;
  onPrefetchDetail: (eventId: string) => void;
};

function EventsVirtualRow({
  ariaAttributes,
  index,
  style,
  events,
  selectedEventId,
  onSelectEvent,
  onPrefetchDetail
}: RowComponentProps<EventVirtualRowProps>) {
  const item = events[index];
  if (!item) {
    return null;
  }
  return (
    <div
      style={style}
      {...ariaAttributes}
      role="row"
      aria-selected={selectedEventId === item.id}
      className={`events-explorer__virtual-row events-explorer__row ${selectedEventId === item.id ? 'is-selected' : ''}`}
      onClick={() => onSelectEvent(item)}
      onMouseEnter={() => onPrefetchDetail(item.id)}
      onFocus={() => onPrefetchDetail(item.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelectEvent(item);
        }
      }}
      tabIndex={0}
    >
      <div role="cell">{formatTimestamp(item.receivedAt)}</div>
      <div role="cell">{item.source}</div>
      <div role="cell">{item.deviceUid ?? '—'}</div>
      <div role="cell">{item.portnum ?? '—'}</div>
      <div role="cell">{item.rxRssi ?? '—'}</div>
      <div role="cell">{item.rxSnr ?? '—'}</div>
      <div role="cell">{buildSummary(item)}</div>
    </div>
  );
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

export default function EventsExplorerPanel({
  isActive,
  hasQueryApiKey,
  navigationNonce,
  navigationRequest,
  onSelectEventForMap,
  onDeviceFilterChange
}: EventsExplorerPanelProps) {
  const queryClient = useQueryClient();
  const [source, setSource] = useState<'' | UnifiedEventSource>('');
  const [deviceUidInput, setDeviceUidInput] = useState('');
  const [portnumInput, setPortnumInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [timePreset, setTimePreset] = useState<TimePreset>('last1h');
  const [customSince, setCustomSince] = useState('');
  const [customUntil, setCustomUntil] = useState('');
  const [quickFilters, setQuickFilters] = useState<EventsQuickFilters>(DEFAULT_QUICK_FILTERS);
  const [savedViews, setSavedViews] = useState<SavedEventsView[]>(() => readSavedEventsViews());
  const [activeSavedViewId, setActiveSavedViewId] = useState('');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [detailEventId, setDetailEventId] = useState<string | null>(null);
  const [detailSwapPending, setDetailSwapPending] = useState(false);
  const [allowHugePayloadRender, setAllowHugePayloadRender] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !isActive) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const parsed = readEventsNavigationParams(params);
    const requestedSource = navigationRequest?.source ?? parsed.source;
    const requestedDeviceUid = normalizeInputText(navigationRequest?.deviceUid ?? parsed.deviceUid ?? '');
    const requestedPortnum = normalizeInputText(navigationRequest?.portnum ?? parsed.portnum ?? '');
    const requestedSearch = normalizeInputText(navigationRequest?.q ?? parsed.q ?? '');
    const requestedFrom = normalizeInputText(navigationRequest?.from ?? parsed.from ?? '');
    const requestedTo = normalizeInputText(navigationRequest?.to ?? parsed.to ?? '');
    const requestedEventId = normalizeInputText(navigationRequest?.eventId ?? parsed.eventId ?? '');
    const hasNavigation = hasEventNavigationInput(navigationRequest, parsed);
    const storedFilters = hasNavigation ? null : readStoredEventsFilters();

    if (hasNavigation) {
      setSource(requestedSource ?? '');
      setDeviceUidInput(requestedDeviceUid);
      setPortnumInput(requestedPortnum);
      setSearchQuery(requestedSearch);
      setQuickFilters(DEFAULT_QUICK_FILTERS);
      if (requestedFrom || requestedTo) {
        setTimePreset('custom');
        setCustomSince(toDateTimeLocalValue(requestedFrom));
        setCustomUntil(toDateTimeLocalValue(requestedTo));
      } else {
        setTimePreset('last1h');
        setCustomSince('');
        setCustomUntil('');
      }
      setActiveSavedViewId('');
      onDeviceFilterChange?.(requestedDeviceUid || null);
    } else if (storedFilters) {
      setSource(storedFilters.source);
      setDeviceUidInput(storedFilters.deviceUidInput);
      setPortnumInput(storedFilters.portnumInput);
      setSearchQuery(storedFilters.searchQuery);
      setTimePreset(storedFilters.timePreset);
      setCustomSince(storedFilters.customSince);
      setCustomUntil(storedFilters.customUntil);
      setQuickFilters(storedFilters.quickFilters);
      setActiveSavedViewId('');
      onDeviceFilterChange?.(normalizeInputText(storedFilters.deviceUidInput) || null);
    } else {
      setSource('');
      setDeviceUidInput('');
      setPortnumInput('');
      setSearchQuery('');
      setTimePreset('last1h');
      setCustomSince('');
      setCustomUntil('');
      setQuickFilters(DEFAULT_QUICK_FILTERS);
      setActiveSavedViewId('');
      onDeviceFilterChange?.(null);
    }

    setSelectedEventId(requestedEventId || null);
    setDetailEventId(requestedEventId || null);
    setDetailSwapPending(false);
  }, [navigationNonce, navigationRequest, isActive]);

  const devicesQuery = useDevices(true, { enabled: isActive && hasQueryApiKey });
  const knownDevices = devicesQuery.data?.items ?? [];
  const normalizedDeviceUidFilter = normalizeInputText(deviceUidInput);
  const normalizedPortnumInput = normalizePortnumValue(portnumInput);
  const hasAnyQuickContentFilter =
    quickFilters.hasGps || quickFilters.hasTelemetry || quickFilters.hasNodeInfo;
  const activeQuickContentCount =
    Number(quickFilters.hasGps) +
    Number(quickFilters.hasTelemetry) +
    Number(quickFilters.hasNodeInfo);
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

  const effectiveBackendPortnum = useMemo(() => {
    if (normalizedPortnumInput) {
      return normalizedPortnumInput;
    }

    if (!hasAnyQuickContentFilter || activeQuickContentCount !== 1) {
      return undefined;
    }
    if (quickFilters.hasTelemetry) {
      return 'TELEMETRY_APP';
    }
    if (quickFilters.hasNodeInfo) {
      return 'NODEINFO_APP';
    }
    if (quickFilters.hasGps && source === 'meshtastic') {
      return 'POSITION_APP';
    }
    return undefined;
  }, [
    normalizedPortnumInput,
    hasAnyQuickContentFilter,
    activeQuickContentCount,
    quickFilters.hasTelemetry,
    quickFilters.hasNodeInfo,
    quickFilters.hasGps,
    source
  ]);

  const filters = useMemo(
    () => ({
      source: source || undefined,
      deviceUid: trimOptional(deviceUidInput),
      portnum: effectiveBackendPortnum,
      q: trimOptional(searchQuery),
      since: range.since,
      until: range.until
    }),
    [source, deviceUidInput, effectiveBackendPortnum, searchQuery, range.since, range.until]
  );

  const eventsQuery = useUnifiedEvents(filters, {
    enabled: isActive && hasQueryApiKey && !customRangeInvalid,
    limit: DEFAULT_LIMIT,
    refetchInterval: refreshInterval
  });

  const detailQuery = useUnifiedEvent(
    detailEventId,
    isActive && hasQueryApiKey && Boolean(detailEventId)
  );

  const fetchedEvents = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [eventsQuery.data]
  );

  const events = useMemo(
    () => fetchedEvents.filter((item) => matchesQuickFilters(item, quickFilters)),
    [fetchedEvents, quickFilters]
  );

  const portnumOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of fetchedEvents) {
      if (item.portnum) {
        values.add(item.portnum);
      }
    }
    return Array.from(values.values()).sort((a, b) => a.localeCompare(b));
  }, [fetchedEvents]);

  const deviceOptions = useMemo(() => {
    const optionMap = new Map<string, string>();
    for (const device of knownDevices) {
      optionMap.set(
        device.deviceUid,
        formatDevicePickerLabel(device.name ?? null, device.longName ?? null, device.deviceUid)
      );
    }
    for (const event of fetchedEvents) {
      if (!event.deviceUid) {
        continue;
      }
      if (!optionMap.has(event.deviceUid)) {
        optionMap.set(event.deviceUid, event.deviceUid);
      }
    }
    if (normalizedDeviceUidFilter && !optionMap.has(normalizedDeviceUidFilter)) {
      optionMap.set(normalizedDeviceUidFilter, `${normalizedDeviceUidFilter} (from link)`);
    }
    return Array.from(optionMap.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [knownDevices, fetchedEvents, normalizedDeviceUidFilter]);

  const requestId = buildRequestId(eventsQuery.error);
  const isLoadingMoreRows = events.length > 0 && eventsQuery.isFetchingNextPage;
  const selectedEvent = detailQuery.data;
  const selectedEventListItem = useMemo(
    () => fetchedEvents.find((item) => item.id === selectedEventId) ?? null,
    [fetchedEvents, selectedEventId]
  );
  const selectedEventDetail =
    selectedEvent && detailEventId && selectedEvent.id === detailEventId ? selectedEvent : null;
  const selectedEventHeader = useMemo(() => {
    if (selectedEventListItem) {
      return {
        source: selectedEventListItem.source,
        deviceUid: selectedEventListItem.deviceUid,
        portnum: selectedEventListItem.portnum,
        receivedAt: selectedEventListItem.receivedAt
      };
    }
    if (selectedEventDetail) {
      return {
        source: selectedEventDetail.source,
        deviceUid: selectedEventDetail.deviceUid,
        portnum: selectedEventDetail.portnum,
        receivedAt: selectedEventDetail.receivedAt
      };
    }
    return null;
  }, [selectedEventDetail, selectedEventListItem]);
  const detailIsLoadingSelection =
    Boolean(selectedEventId) &&
    (detailSwapPending || (detailEventId === selectedEventId && detailQuery.isFetching));
  const isShowingPreviousDetailWhileLoading =
    detailIsLoadingSelection &&
    Boolean(selectedEventDetail) &&
    selectedEventDetail?.id !== selectedEventId;
  const detailError = detailEventId === selectedEventId ? detailQuery.error : null;
  const detailRequestId = buildRequestId(detailError);

  const payloadSerialization = useMemo(
    () => serializePayload(selectedEventDetail?.payloadJson),
    [selectedEventDetail?.id, selectedEventDetail?.payloadJson]
  );

  const payloadIsLarge = payloadSerialization.bytes >= LARGE_PAYLOAD_BYTES;
  const payloadIsHuge = payloadSerialization.bytes >= HUGE_PAYLOAD_BYTES;
  const payloadShouldRenderTree = !payloadIsHuge || allowHugePayloadRender;
  const highlights = useMemo(
    () => extractHighlights(selectedEventDetail?.payloadJson),
    [selectedEventDetail?.id, selectedEventDetail?.payloadJson]
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const sinceIso =
      timePreset === 'custom' ? parseLocalDateTime(customSince)?.toISOString() ?? null : null;
    const untilIso =
      timePreset === 'custom' ? parseLocalDateTime(customUntil)?.toISOString() ?? null : null;

    applyEventsNavigationParams(params, {
      source: source || null,
      deviceUid: trimOptional(deviceUidInput) ?? null,
      portnum: trimOptional(portnumInput) ?? null,
      q: trimOptional(searchQuery) ?? null,
      from: sinceIso,
      to: untilIso,
      eventId: selectedEventId
    });

    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [
    source,
    deviceUidInput,
    portnumInput,
    searchQuery,
    timePreset,
    customSince,
    customUntil,
    selectedEventId
  ]);

  const currentStoredFilters = useMemo<StoredEventsFilters>(
    () =>
      buildStoredFilters({
        source,
        deviceUidInput,
        portnumInput,
        searchQuery,
        timePreset,
        customSince,
        customUntil,
        quickFilters
      }),
    [source, deviceUidInput, portnumInput, searchQuery, timePreset, customSince, customUntil, quickFilters]
  );

  useEffect(() => {
    writeStoredEventsFilters(currentStoredFilters);
  }, [currentStoredFilters]);

  useEffect(() => {
    if (!activeSavedViewId) {
      return;
    }
    const activeView = savedViews.find((view) => view.id === activeSavedViewId);
    if (!activeView) {
      setActiveSavedViewId('');
      return;
    }
    if (JSON.stringify(activeView.filters) !== JSON.stringify(currentStoredFilters)) {
      setActiveSavedViewId('');
    }
  }, [activeSavedViewId, savedViews, currentStoredFilters]);

  useEffect(() => {
    if (!selectedEventId) {
      return;
    }
    const stillVisible = events.some((item) => item.id === selectedEventId);
    if (!stillVisible) {
      setSelectedEventId(null);
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    if (selectedEventId) {
      return;
    }
    setDetailEventId(null);
    setDetailSwapPending(false);
  }, [selectedEventId]);

  useEffect(() => {
    setAllowHugePayloadRender(false);
  }, [selectedEventId]);

  const handlePrefetchDetail = (eventId: string) => {
    if (!hasQueryApiKey) {
      return;
    }
    void queryClient.prefetchQuery({
      queryKey: ['events-detail', eventId],
      queryFn: ({ signal }) => getUnifiedEventById(eventId, { signal }),
      staleTime: 30_000
    });
  };

  const handleDeviceInputChange = (value: string) => {
    setDeviceUidInput(value);
    const normalized = normalizeInputText(value);
    onDeviceFilterChange?.(normalized || null);
  };

  const handleToggleSourceChip = (nextSource: UnifiedEventSource) => {
    setSource((previous) => (previous === nextSource ? '' : nextSource));
  };

  const handleTogglePortnumChip = (nextPortnum: (typeof QUICK_PORTNUM_CHIPS)[number]) => {
    setPortnumInput((previous) =>
      normalizePortnumValue(previous) === nextPortnum ? '' : nextPortnum
    );
  };

  const handleToggleQuickFilter = (key: keyof EventsQuickFilters) => {
    setQuickFilters((previous) => ({
      ...previous,
      [key]: !previous[key]
    }));
  };

  const handleApplySavedView = (viewId: string) => {
    if (!viewId) {
      setActiveSavedViewId('');
      return;
    }
    const view = savedViews.find((entry) => entry.id === viewId);
    if (!view) {
      setActiveSavedViewId('');
      return;
    }
    setSource(view.filters.source);
    setDeviceUidInput(view.filters.deviceUidInput);
    setPortnumInput(view.filters.portnumInput);
    setSearchQuery(view.filters.searchQuery);
    setTimePreset(view.filters.timePreset);
    setCustomSince(view.filters.customSince);
    setCustomUntil(view.filters.customUntil);
    setQuickFilters(view.filters.quickFilters);
    setActiveSavedViewId(view.id);
    onDeviceFilterChange?.(normalizeInputText(view.filters.deviceUidInput) || null);
  };

  const handleSaveCurrentView = () => {
    if (typeof window === 'undefined') {
      return;
    }
    const existingView = savedViews.find((view) => view.id === activeSavedViewId) ?? null;
    const suggestedName = existingView?.name ?? '';
    const nameInput = window.prompt('Saved view name', suggestedName);
    const name = normalizeInputText(nameInput);
    if (!name) {
      return;
    }
    const now = new Date().toISOString();
    const nextId =
      existingView?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const nextView: SavedEventsView = {
      id: nextId,
      name,
      filters: currentStoredFilters,
      createdAt: existingView?.createdAt ?? now,
      updatedAt: now
    };
    const nextViews = existingView
      ? savedViews.map((view) => (view.id === existingView.id ? nextView : view))
      : [...savedViews, nextView];
    setSavedViews(nextViews);
    setActiveSavedViewId(nextId);
    writeSavedEventsViews(nextViews);
  };

  const handleDeleteActiveView = () => {
    if (!activeSavedViewId) {
      return;
    }
    const nextViews = savedViews.filter((view) => view.id !== activeSavedViewId);
    setSavedViews(nextViews);
    setActiveSavedViewId('');
    writeSavedEventsViews(nextViews);
  };

  const handleSelectEvent = (eventItem: UnifiedEventListItem) => {
    setSelectedEventId(eventItem.id);
    const rowDeviceUid = normalizeInputText(eventItem.deviceUid);
    if (rowDeviceUid) {
      onDeviceFilterChange?.(rowDeviceUid);
    }
    onSelectEventForMap?.(eventItem);
    if (!hasQueryApiKey) {
      return;
    }
    const eventId = eventItem.id;
    if (!detailEventId) {
      setDetailEventId(eventId);
      setDetailSwapPending(false);
      return;
    }
    if (detailEventId === eventId) {
      setDetailSwapPending(false);
      return;
    }

    const cachedDetail = queryClient.getQueryData<UnifiedEventDetail>(['events-detail', eventId]);
    if (cachedDetail) {
      setDetailEventId(eventId);
      setDetailSwapPending(false);
      return;
    }

    setDetailSwapPending(true);
    void queryClient
      .fetchQuery({
        queryKey: ['events-detail', eventId],
        queryFn: ({ signal }) => getUnifiedEventById(eventId, { signal }),
        staleTime: 30_000
      })
      .catch(() => undefined)
      .finally(() => {
        setDetailEventId(eventId);
        setDetailSwapPending(false);
      });
  };

  const virtualRowProps = useMemo<EventVirtualRowProps>(
    () => ({
      events,
      selectedEventId,
      onSelectEvent: handleSelectEvent,
      onPrefetchDetail: handlePrefetchDetail
    }),
    [events, selectedEventId, handleSelectEvent, handlePrefetchDetail]
  );

  return (
    <section className="events-explorer" aria-label="Unified events explorer">
      <div className="events-explorer__header">
        <h3>Events</h3>
      </div>

      {!hasQueryApiKey ? (
        <div className="events-explorer__message">Events requires QUERY key.</div>
      ) : (
        <>
          <div className="events-explorer__saved-views">
            <label>
              Saved view
              <select
                value={activeSavedViewId}
                onChange={(event) => handleApplySavedView(event.target.value)}
                aria-label="Saved events view"
              >
                <option value="">Current filters</option>
                {savedViews.map((view) => (
                  <option key={view.id} value={view.id}>
                    {view.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="controls__button controls__button--compact"
              onClick={handleSaveCurrentView}
            >
              Save view
            </button>
            <button
              type="button"
              className="controls__button controls__button--compact"
              onClick={handleDeleteActiveView}
              disabled={!activeSavedViewId}
            >
              Delete
            </button>
          </div>

          <div className="events-explorer__chips" aria-label="Quick source filters">
            <span className="events-explorer__chips-label">Source</span>
            <button
              type="button"
              className={`events-explorer__chip ${source === 'meshtastic' ? 'is-active' : ''}`}
              onClick={() => handleToggleSourceChip('meshtastic')}
            >
              Meshtastic
            </button>
            <button
              type="button"
              className={`events-explorer__chip ${source === 'lorawan' ? 'is-active' : ''}`}
              onClick={() => handleToggleSourceChip('lorawan')}
            >
              LoRaWAN
            </button>
          </div>

          <div className="events-explorer__chips" aria-label="Quick portnum filters">
            <span className="events-explorer__chips-label">Portnum</span>
            {QUICK_PORTNUM_CHIPS.map((chipPortnum) => (
              <button
                key={chipPortnum}
                type="button"
                className={`events-explorer__chip ${normalizedPortnumInput === chipPortnum ? 'is-active' : ''}`}
                onClick={() => handleTogglePortnumChip(chipPortnum)}
              >
                {chipPortnum}
              </button>
            ))}
          </div>

          <div className="events-explorer__chips" aria-label="Quick content filters">
            <span className="events-explorer__chips-label">Signals</span>
            <button
              type="button"
              className={`events-explorer__chip ${quickFilters.hasGps ? 'is-active' : ''}`}
              onClick={() => handleToggleQuickFilter('hasGps')}
            >
              Has GPS
            </button>
            <button
              type="button"
              className={`events-explorer__chip ${quickFilters.hasRx ? 'is-active' : ''}`}
              onClick={() => handleToggleQuickFilter('hasRx')}
            >
              Has RX RSSI/SNR
            </button>
            <button
              type="button"
              className={`events-explorer__chip ${quickFilters.hasTelemetry ? 'is-active' : ''}`}
              onClick={() => handleToggleQuickFilter('hasTelemetry')}
            >
              Has Telemetry
            </button>
            <button
              type="button"
              className={`events-explorer__chip ${quickFilters.hasNodeInfo ? 'is-active' : ''}`}
              onClick={() => handleToggleQuickFilter('hasNodeInfo')}
            >
              Has NodeInfo
            </button>
          </div>

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
              <select
                value={normalizedDeviceUidFilter}
                onChange={(event) => handleDeviceInputChange(event.target.value)}
                aria-label="Device UID filter"
              >
                <option value="">All devices</option>
                {deviceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
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
            <div className="events-explorer__table" role="table" aria-label="Events">
              <div className="events-explorer__virtual-row events-explorer__virtual-row--header" role="row">
                {EVENT_COLUMN_HEADERS.map((label) => (
                  <div key={label} role="columnheader">
                    {label}
                  </div>
                ))}
              </div>
              <List
                className="events-explorer__virtual-list"
                rowComponent={EventsVirtualRow}
                rowCount={events.length}
                rowHeight={EVENT_ROW_HEIGHT}
                rowProps={virtualRowProps}
                style={{ height: EVENT_LIST_HEIGHT }}
                overscanCount={8}
              />
            </div>
            {!eventsQuery.isLoading && events.length === 0 ? (
              <div className="events-explorer__empty">
                {fetchedEvents.length > 0
                  ? 'No events match active quick chips.'
                  : 'No events found for current filters.'}
              </div>
            ) : null}
            {isLoadingMoreRows ? (
              <div className="events-explorer__loading-mask" role="status" aria-live="polite">
                Loading more events…
              </div>
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

      <datalist id="events-portnum-options">
        {portnumOptions.map((portnum) => (
          <option key={portnum} value={portnum} />
        ))}
      </datalist>

      {selectedEventId ? (
        <aside className="events-explorer__drawer" aria-label="Event detail">
          <div className="events-explorer__drawer-header">
            <div className="events-explorer__drawer-header-main">
              <h4>{selectedEventHeader?.source?.toUpperCase() ?? 'Event'} detail</h4>
              <div className="events-explorer__drawer-header-subtitle">
                <span>{selectedEventHeader?.deviceUid ?? 'unknown-device'}</span>
                <span>{selectedEventHeader?.portnum ?? 'port: —'}</span>
                <span>{formatTimestamp(selectedEventHeader?.receivedAt)}</span>
                {detailIsLoadingSelection ? (
                  <span>{isShowingPreviousDetailWhileLoading ? 'Updating…' : 'Loading…'}</span>
                ) : null}
              </div>
            </div>
            <button type="button" onClick={() => setSelectedEventId(null)}>
              Close
            </button>
          </div>

          {selectedEventDetail ? (
            <div className="events-explorer__drawer-body">
              {isShowingPreviousDetailWhileLoading ? (
                <div className="events-explorer__drawer-note">Loading selected event details…</div>
              ) : null}
              <dl className="events-explorer__detail-list">
                <dt>Packet</dt>
                <dd>{selectedEventDetail.packetId ?? '—'}</dd>
                <dt>Type</dt>
                <dd>{selectedEventDetail.eventType ?? '—'}</dd>
                <dt>Error</dt>
                <dd>{selectedEventDetail.error ?? '—'}</dd>
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
                  value={selectedEventDetail.payloadJson}
                  serializedPayload={payloadSerialization.text}
                  defaultCollapsed={payloadIsLarge || payloadIsHuge}
                />
              ) : null}
            </div>
          ) : detailError ? (
            <div className="events-explorer__drawer-body events-explorer__error">
              <div>Failed to load event detail: {detailError.message}</div>
              {detailRequestId ? <div>X-Request-Id: {detailRequestId}</div> : null}
            </div>
          ) : detailIsLoadingSelection ? (
            <div className="events-explorer__drawer-body">Loading event detail…</div>
          ) : (
            <div className="events-explorer__drawer-body">No detail available.</div>
          )}
        </aside>
      ) : null}
    </section>
  );
}
