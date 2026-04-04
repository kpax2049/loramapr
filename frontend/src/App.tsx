import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { keepPreviousData, useQueries, useQueryClient } from '@tanstack/react-query';
import { IconChartBar, IconChevronRight, IconFileSearch } from '@tabler/icons-react';
import {
  getMeasurements,
  getSessionOverview,
  getSessionStats,
  getSessionWindow,
  type CoverageQueryParams,
  type MeasurementQueryParams
} from './api/endpoints';
import type {
  CoverageBin,
  Measurement,
  Session,
  SessionWindowPoint,
  UnifiedEventListItem
} from './api/types';
import Controls from './components/Controls';
import { buildDeviceIdentityLabel } from './components/DeviceIcon';
import Layout from './components/Layout';
import MapView, { type MapViewHandle } from './components/MapView';
import PlaybackPanel from './components/PlaybackPanel';
import PointDetails from './components/PointDetails';
import SelectedDeviceHeader from './components/SelectedDeviceHeader';
import type { SessionComparisonItem } from './components/SessionComparisonPanel';
import StatusStrip from './components/StatusStrip';
import StatsCard from './components/StatsCard';
import markDark from './assets/branding/loramapr-mark-dark.png';
import markLight from './assets/branding/loramapr-mark-light.png';
import logoDark from './assets/branding/loramapr-logo-dark.png';
import logoLight from './assets/branding/loramapr-logo-light.png';
import {
  useAutoSession,
  useCoverageBins,
  useDevice,
  useDeviceDetail,
  useDeviceLatest,
  useDevices,
  useDevicesLatestLocations,
  useMeasurements,
  useStats,
  useTrack
} from './query/hooks';
import { useLorawanEvents } from './query/lorawan';
import { useSessionTimeline, useSessions, useSessionWindow } from './query/sessions';
import {
  MAX_COMPARED_SESSIONS,
  areStringListsEqual,
  buildSessionDurationMs,
  formatDistanceMeters,
  formatSessionLabel,
  getSessionComparisonStyle,
  parseComparedSessionIds
} from './sessionComparison';
import { useAppTour } from './tour/AppTourProvider';
import type { TourSidebarTabKey } from './tour/steps';
import { applyEventsNavigationParams, type EventsNavigationInput } from './utils/eventsNavigation';
import './App.css';

const DEFAULT_LIMIT = 2000;
const LOW_ZOOM_LIMIT = 1000;
const LIMIT_ZOOM_THRESHOLD = 12;
const BBOX_DEBOUNCE_MS = 300;
const SAMPLE_ZOOM_LOW = 12;
const SAMPLE_ZOOM_MEDIUM = 14;
const COMPARISON_TRACK_SAMPLE = 1200;
const LORAWAN_DIAG_WINDOW_MINUTES = 10;
const SIDEBAR_TAB_KEY = 'sidebarTab';
const ZEN_MODE_KEY = 'zenMode';
const THEME_MODE_KEY = 'themeMode';
const SHOW_DEVICE_MARKERS_KEY = 'showDeviceMarkers';
const SHOW_COVERAGE_TRACKS_KEY = 'showCoverageTracks';
const SHOW_HOME_GEOFENCE_PREFIX = 'showHomeGeofence:';
const POINT_DETAILS_COLLAPSED_KEY = 'rightPanelPointDetailsCollapsed';
const STATS_PANEL_COLLAPSED_KEY = 'rightPanelStatsCollapsed';
const APP_NAME = __APP_NAME__;
const APP_VERSION = __APP_VERSION__;
const DEVICE_ICON_GALLERY_ROUTE = '/dev/device-icons';
const SIDEBAR_LAYOUT_TEST_ROUTE = '/dev/sidebar-layout';

function normalizePathname(pathname: string): string {
  if (!pathname) {
    return '/';
  }
  const normalized = pathname.replace(/\/+/g, '/');
  return normalized.length > 1 ? normalized.replace(/\/$/, '') : normalized;
}

const SHOW_DEVICE_ICON_GALLERY =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  normalizePathname(window.location.pathname) === DEVICE_ICON_GALLERY_ROUTE;
const SHOW_SIDEBAR_LAYOUT_TEST =
  import.meta.env.DEV &&
  typeof window !== 'undefined' &&
  normalizePathname(window.location.pathname) === SIDEBAR_LAYOUT_TEST_ROUTE;
const DevDeviceIconGallery = import.meta.env.DEV
  ? lazy(() => import('./components/dev/DeviceIconGallery'))
  : null;
const DevSidebarLayoutTest = import.meta.env.DEV
  ? lazy(() => import('./components/dev/SidebarLayoutTest'))
  : null;

type SidebarTab = 'device' | 'sessions' | 'playback' | 'coverage' | 'debug';
type CoverageScope = 'device' | 'session';
type ThemeMode = 'system' | 'light' | 'dark';
type EffectiveTheme = 'light' | 'dark';

type InitialQueryState = {
  deviceId: string | null;
  filterMode: 'time' | 'session';
  sessionId: string | null;
  compareSessionIds: string[];
  from: string;
  to: string;
  showPoints: boolean;
  showTrack: boolean;
  exploreRangePreset: ExploreRangePreset;
  useAdvancedRange: boolean;
  viewMode: 'explore' | 'playback';
  playbackSessionId: string | null;
  playbackCursorMs: number;
  playbackWindowMs: number;
  playbackSpeed: 0.25 | 0.5 | 1 | 2 | 4;
};

const SIDEBAR_TABS: Array<{ key: SidebarTab; label: string; shortLabel: string }> = [
  { key: 'device', label: 'Device', shortLabel: 'D' },
  { key: 'sessions', label: 'Sessions', shortLabel: 'S' },
  { key: 'playback', label: 'Playback', shortLabel: 'P' },
  { key: 'coverage', label: 'Coverage', shortLabel: 'C' },
  { key: 'debug', label: 'Debug', shortLabel: 'B' }
];

function parseBoolean(value: string | null, defaultValue: boolean): boolean {
  if (value === null) {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return defaultValue;
}

function areBboxesEqual(
  left: [number, number, number, number] | null,
  right: [number, number, number, number] | null
): boolean {
  if (!left || !right) {
    return left === right;
  }
  return (
    left[0] === right[0] &&
    left[1] === right[1] &&
    left[2] === right[2] &&
    left[3] === right[3]
  );
}

function parsePlaybackSpeed(value: string | null): 0.25 | 0.5 | 1 | 2 | 4 {
  if (!value) {
    return 1;
  }
  const parsed = Number(value);
  if (parsed === 0.25 || parsed === 0.5 || parsed === 1 || parsed === 2 || parsed === 4) {
    return parsed;
  }
  return 1;
}

function parsePlaybackCursor(value: string | null): number {
  if (!value) {
    return Date.now();
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function parsePlaybackWindowMs(value: string | null): number {
  if (!value) {
    return 10 * 60 * 1000;
  }
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return 10 * 60 * 1000;
  }
  return minutes * 60 * 1000;
}

type ExploreRangePreset = 'last15m' | 'last1h' | 'last6h' | 'last24h' | 'all';

function parseExploreRangePreset(value: string | null): ExploreRangePreset {
  if (!value) {
    return 'all';
  }
  switch (value) {
    case 'last15m':
    case 'last1h':
    case 'last6h':
    case 'last24h':
    case 'all':
      return value;
    default:
      return 'all';
  }
}

function readInitialSidebarTab(): SidebarTab {
  if (typeof window === 'undefined') {
    return 'device';
  }
  const params = new URLSearchParams(window.location.search);
  const queryTab = params.get('tab') ?? params.get('sidebarTab');
  if (
    queryTab === 'device' ||
    queryTab === 'sessions' ||
    queryTab === 'playback' ||
    queryTab === 'coverage' ||
    queryTab === 'debug'
  ) {
    return queryTab;
  }
  const raw = window.localStorage.getItem(SIDEBAR_TAB_KEY);
  if (raw === 'device' || raw === 'sessions' || raw === 'playback' || raw === 'coverage' || raw === 'debug') {
    return raw;
  }
  return 'device';
}

function readStoredZenMode(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(ZEN_MODE_KEY) === 'true';
}

function readStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system';
  }
  const raw = window.localStorage.getItem(THEME_MODE_KEY);
  if (raw === 'system' || raw === 'light' || raw === 'dark') {
    return raw;
  }
  return 'system';
}

function readStoredShowDeviceMarkers(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(SHOW_DEVICE_MARKERS_KEY) === 'true';
}

function readStoredShowCoverageTracks(): boolean {
  if (typeof window === 'undefined') {
    return true;
  }
  const raw = window.localStorage.getItem(SHOW_COVERAGE_TRACKS_KEY);
  if (raw === null) {
    return true;
  }
  return raw === 'true';
}

function buildHomeGeofenceStorageKey(deviceId: string): string {
  return `${SHOW_HOME_GEOFENCE_PREFIX}${deviceId}`;
}

function readStoredShowHomeGeofence(deviceId: string | null): boolean | null {
  if (typeof window === 'undefined' || !deviceId) {
    return null;
  }
  const raw = window.localStorage.getItem(buildHomeGeofenceStorageKey(deviceId));
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  return null;
}

function readStoredBoolean(key: string): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(key) === 'true';
}

function readSystemTheme(): EffectiveTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function computePresetRange(
  preset: ExploreRangePreset,
  anchorMs: number
): { from: string; to: string } | null {
  if (preset === 'all') {
    return null;
  }
  const durationMs =
    preset === 'last15m'
      ? 15 * 60 * 1000
      : preset === 'last1h'
        ? 60 * 60 * 1000
        : preset === 'last6h'
          ? 6 * 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;
  const to = new Date(anchorMs).toISOString();
  const from = new Date(anchorMs - durationMs).toISOString();
  return { from, to };
}

function buildSessionWindowKey(params: {
  sessionId: string;
  cursor: Date | string;
  windowMs: number;
  sample?: number;
  limit?: number;
}) {
  return {
    sessionId: params.sessionId ?? null,
    cursor: params.cursor instanceof Date ? params.cursor.toISOString() : params.cursor,
    windowMs: params.windowMs,
    sample: typeof params.sample === 'number' ? params.sample : null,
    limit: typeof params.limit === 'number' ? params.limit : null
  };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof Element)) {
    return false;
  }
  const tag = target.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return true;
  }
  return target.hasAttribute('contenteditable');
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

function toTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function toUtcDayIso(value: string | number | Date | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function getApproxDistanceMeters(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number
): number {
  const latMeters = (fromLat - toLat) * 111_320;
  const avgLatRad = ((fromLat + toLat) / 2) * (Math.PI / 180);
  const lonMeters = (fromLon - toLon) * 111_320 * Math.cos(avgLatRad);
  return Math.hypot(latMeters, lonMeters);
}

function getDeviceMarkerSortTimestamp(device: {
  latestMeasurementAt: string | null;
  latestWebhookReceivedAt: string | null;
}): number {
  const value = device.latestMeasurementAt ?? device.latestWebhookReceivedAt;
  if (!value) {
    return 0;
  }
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

type LatLonPoint = [number, number];
type LatLonBounds = [[number, number], [number, number]];

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toLatLonPoint(lat: unknown, lon: unknown): LatLonPoint | null {
  const safeLat = toFiniteNumber(lat);
  const safeLon = toFiniteNumber(lon);
  if (safeLat === null || safeLon === null) {
    return null;
  }
  return [safeLat, safeLon];
}

function isFiniteCoordinate(lat: unknown, lon: unknown): boolean {
  return toLatLonPoint(lat, lon) !== null;
}

function normalizeLatLonItem<T extends { lat: unknown; lon: unknown }>(
  item: T
): (Omit<T, 'lat' | 'lon'> & { lat: number; lon: number }) | null {
  const point = toLatLonPoint(item.lat, item.lon);
  if (!point) {
    return null;
  }
  return {
    ...item,
    lat: point[0],
    lon: point[1]
  };
}

function isValidLatLonBounds(bounds: LatLonBounds | null): bounds is LatLonBounds {
  if (!bounds) {
    return false;
  }
  return (
    toLatLonPoint(bounds[0][0], bounds[0][1]) !== null &&
    toLatLonPoint(bounds[1][0], bounds[1][1]) !== null
  );
}

function isDegenerateBounds(bounds: LatLonBounds): boolean {
  const latSpan = Math.abs(bounds[1][0] - bounds[0][0]);
  const lonSpan = Math.abs(bounds[1][1] - bounds[0][1]);
  return latSpan < 1e-9 && lonSpan < 1e-9;
}

function buildBoundsFromPoints(points: LatLonPoint[]): LatLonBounds | null {
  if (points.length === 0) {
    return null;
  }

  let minLat = points[0][0];
  let maxLat = points[0][0];
  let minLon = points[0][1];
  let maxLon = points[0][1];

  for (const [lat, lon] of points) {
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
  }

  return [
    [minLat, minLon],
    [maxLat, maxLon]
  ];
}

function buildCoverageFitTarget(
  bins: CoverageBin[] | undefined,
  binSizeDeg: number | null | undefined
): { points: LatLonPoint[]; bounds: LatLonBounds | null } {
  if (!bins || bins.length === 0) {
    return { points: [], bounds: null };
  }

  if (typeof binSizeDeg === 'number' && Number.isFinite(binSizeDeg) && binSizeDeg > 0) {
    const points: LatLonPoint[] = [];
    let minLat = Number.POSITIVE_INFINITY;
    let maxLat = Number.NEGATIVE_INFINITY;
    let minLon = Number.POSITIVE_INFINITY;
    let maxLon = Number.NEGATIVE_INFINITY;

    for (const bin of bins) {
      const binMinLat = bin.latBin * binSizeDeg;
      const binMinLon = bin.lonBin * binSizeDeg;
      const binMaxLat = binMinLat + binSizeDeg;
      const binMaxLon = binMinLon + binSizeDeg;
      const centerLat = binMinLat + binSizeDeg / 2;
      const centerLon = binMinLon + binSizeDeg / 2;

      if (!isFiniteCoordinate(centerLat, centerLon)) {
        continue;
      }

      points.push([centerLat, centerLon]);
      if (binMinLat < minLat) minLat = binMinLat;
      if (binMaxLat > maxLat) maxLat = binMaxLat;
      if (binMinLon < minLon) minLon = binMinLon;
      if (binMaxLon > maxLon) maxLon = binMaxLon;
    }

    if (points.length === 0) {
      return { points: [], bounds: null };
    }

    const bounds =
      Number.isFinite(minLat) &&
      Number.isFinite(maxLat) &&
      Number.isFinite(minLon) &&
      Number.isFinite(maxLon)
        ? ([[minLat, minLon], [maxLat, maxLon]] as LatLonBounds)
        : buildBoundsFromPoints(points);

    return { points, bounds };
  }

  const points: LatLonPoint[] = bins
    .map((bin) => [bin.latBin, bin.lonBin] as LatLonPoint)
    .filter(([lat, lon]) => isFiniteCoordinate(lat, lon));
  return { points, bounds: buildBoundsFromPoints(points) };
}

type CoverageBinMergeAccumulator = {
  latBin: number;
  lonBin: number;
  gatewayId: string | null;
  count: number;
  rssiMin: number | null;
  rssiMax: number | null;
  snrMin: number | null;
  snrMax: number | null;
  rssiAvgWeightedSum: number;
  rssiAvgWeight: number;
  snrAvgWeightedSum: number;
  snrAvgWeight: number;
};

function mergeNullableMin(current: number | null, value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return current;
  }
  if (typeof current !== 'number' || !Number.isFinite(current)) {
    return value;
  }
  return Math.min(current, value);
}

function mergeNullableMax(current: number | null, value: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return current;
  }
  if (typeof current !== 'number' || !Number.isFinite(current)) {
    return value;
  }
  return Math.max(current, value);
}

function toCoverageMergeKey(bin: Pick<CoverageBin, 'latBin' | 'lonBin' | 'gatewayId'>): string {
  return `${bin.latBin}:${bin.lonBin}:${bin.gatewayId ?? 'all'}`;
}

function mergeCoverageBinsByGateway(bins: CoverageBin[] | undefined): CoverageBin[] {
  if (!bins || bins.length === 0) {
    return [];
  }

  const merged = new Map<string, CoverageBinMergeAccumulator>();
  for (const bin of bins) {
    if (!Number.isFinite(bin.latBin) || !Number.isFinite(bin.lonBin)) {
      continue;
    }

    const key = toCoverageMergeKey(bin);
    const existing = merged.get(key);
    const accumulator: CoverageBinMergeAccumulator =
      existing ?? {
        latBin: bin.latBin,
        lonBin: bin.lonBin,
        gatewayId: bin.gatewayId ?? null,
        count: 0,
        rssiMin: null,
        rssiMax: null,
        snrMin: null,
        snrMax: null,
        rssiAvgWeightedSum: 0,
        rssiAvgWeight: 0,
        snrAvgWeightedSum: 0,
        snrAvgWeight: 0
      };

    const countValue =
      typeof bin.count === 'number' && Number.isFinite(bin.count) ? Math.max(0, bin.count) : 0;
    accumulator.count += countValue;
    accumulator.rssiMin = mergeNullableMin(accumulator.rssiMin, bin.rssiMin);
    accumulator.rssiMax = mergeNullableMax(accumulator.rssiMax, bin.rssiMax);
    accumulator.snrMin = mergeNullableMin(accumulator.snrMin, bin.snrMin);
    accumulator.snrMax = mergeNullableMax(accumulator.snrMax, bin.snrMax);

    if (typeof bin.rssiAvg === 'number' && Number.isFinite(bin.rssiAvg) && countValue > 0) {
      accumulator.rssiAvgWeightedSum += bin.rssiAvg * countValue;
      accumulator.rssiAvgWeight += countValue;
    }
    if (typeof bin.snrAvg === 'number' && Number.isFinite(bin.snrAvg) && countValue > 0) {
      accumulator.snrAvgWeightedSum += bin.snrAvg * countValue;
      accumulator.snrAvgWeight += countValue;
    }

    merged.set(key, accumulator);
  }

  return Array.from(merged.values()).map((bin) => ({
    latBin: bin.latBin,
    lonBin: bin.lonBin,
    gatewayId: bin.gatewayId,
    count: bin.count,
    rssiMin: bin.rssiMin,
    rssiMax: bin.rssiMax,
    snrMin: bin.snrMin,
    snrMax: bin.snrMax,
    rssiAvg: bin.rssiAvgWeight > 0 ? bin.rssiAvgWeightedSum / bin.rssiAvgWeight : null,
    snrAvg: bin.snrAvgWeight > 0 ? bin.snrAvgWeightedSum / bin.snrAvgWeight : null
  }));
}

function readInitialQueryState(): InitialQueryState {
  if (typeof window === 'undefined') {
    return {
      deviceId: null,
      filterMode: 'time',
      sessionId: null,
      compareSessionIds: [],
      from: '',
      to: '',
      showPoints: true,
      showTrack: true,
      exploreRangePreset: 'all',
      useAdvancedRange: false,
      viewMode: 'explore',
      playbackSessionId: null,
      playbackCursorMs: Date.now(),
      playbackWindowMs: 10 * 60 * 1000,
      playbackSpeed: 1
    };
  }

  const params = new URLSearchParams(window.location.search);
  const filterModeParam = params.get('filterMode');
  const filterMode = filterModeParam === 'session' ? 'session' : 'time';
  const viewModeParam = params.get('viewMode');
  const viewMode = viewModeParam === 'playback' ? 'playback' : 'explore';
  const hasCustomRange = Boolean(params.get('from') || params.get('to'));
  const rangeAdvancedParam = params.get('rangeAdvanced');
  const useAdvancedRange =
    rangeAdvancedParam !== null
      ? parseBoolean(rangeAdvancedParam, hasCustomRange)
      : hasCustomRange;

  return {
    deviceId: params.get('deviceId'),
    filterMode,
    sessionId: params.get('sessionId'),
    compareSessionIds: parseComparedSessionIds(params.get('compareSessionIds')),
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    showPoints: parseBoolean(params.get('showPoints'), true),
    showTrack: parseBoolean(params.get('showTrack'), true),
    exploreRangePreset: parseExploreRangePreset(params.get('rangePreset')),
    useAdvancedRange,
    viewMode,
    playbackSessionId: params.get('playbackSessionId'),
    playbackCursorMs: parsePlaybackCursor(params.get('playbackCursor')),
    playbackWindowMs: parsePlaybackWindowMs(params.get('playbackWindowMinutes')),
    playbackSpeed: parsePlaybackSpeed(params.get('playbackSpeed'))
  };
}

function App() {
  if (SHOW_DEVICE_ICON_GALLERY && DevDeviceIconGallery) {
    return (
      <Suspense fallback={<div className="device-icon-gallery">Loading icon gallery...</div>}>
        <DevDeviceIconGallery />
      </Suspense>
    );
  }

  if (SHOW_SIDEBAR_LAYOUT_TEST && DevSidebarLayoutTest) {
    return (
      <Suspense fallback={<div className="sidebar-layout-test">Loading sidebar layout test...</div>}>
        <DevSidebarLayoutTest />
      </Suspense>
    );
  }

  const initial = useMemo(() => readInitialQueryState(), []);
  const { startTour, isTourActive, resetTour } = useAppTour();

  const queryClient = useQueryClient();
  const prevLatestMeasurementAt = useRef<string | null>(null);
  const mapRef = useRef<MapViewHandle | null>(null);
  const hasAutoFitRef = useRef(false);
  const playbackStartRef = useRef<number | null>(null);
  const playbackStartCursorRef = useRef(0);
  const playbackStepRef = useRef(0);
  const playbackCursorRef = useRef(0);
  const selectedSessionChangedAtRef = useRef(0);
  const playbackSessionChangedAtRef = useRef(0);
  const previousDeviceIdRef = useRef<string | null>(initial.deviceId);
  const previousCoverageMapLayerRef = useRef<'points' | 'coverage'>('points');
  const previousFocusedCoverageSessionIdRef = useRef<string | null>(null);
  const coverageBinsBboxCommitTimerRef = useRef<number | null>(null);

  const [deviceId, setDeviceId] = useState<string | null>(initial.deviceId);
  const [filterMode, setFilterMode] = useState<'time' | 'session'>(initial.filterMode);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initial.sessionId);
  const [compareSelectionIds, setCompareSelectionIds] = useState<string[]>(initial.compareSessionIds);
  const [compareSessionIds, setCompareSessionIds] = useState<string[]>(initial.compareSessionIds);
  const [hiddenComparisonSessionIds, setHiddenComparisonSessionIds] = useState<string[]>([]);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [exploreRangePreset, setExploreRangePreset] = useState<ExploreRangePreset>(
    initial.exploreRangePreset
  );
  const [useAdvancedRange, setUseAdvancedRange] = useState(initial.useAdvancedRange);
  const [presetAnchorMs, setPresetAnchorMs] = useState(Date.now());
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
  const [pointsBboxCommitted, setPointsBboxCommitted] = useState<
    [number, number, number, number] | null
  >(null);
  const [coverageBinsBboxCommitted, setCoverageBinsBboxCommitted] = useState<
    [number, number, number, number] | null
  >(null);
  const [debouncedBbox, setDebouncedBbox] = useState<[number, number, number, number] | null>(null);
  const [currentZoom, setCurrentZoom] = useState(12);
  const [viewMode, setViewMode] = useState<'explore' | 'playback'>(initial.viewMode);
  const [playbackSessionId, setPlaybackSessionId] = useState<string | null>(
    initial.playbackSessionId
  );
  const [playbackCursorMs, setPlaybackCursorMs] = useState(initial.playbackCursorMs);
  const [playbackWindowMs, setPlaybackWindowMs] = useState(initial.playbackWindowMs);
  const [playbackIsPlaying, setPlaybackIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.25 | 0.5 | 1 | 2 | 4>(
    initial.playbackSpeed
  );
  const [playbackRefetchIntervalMs, setPlaybackRefetchIntervalMs] = useState(1500);
  const playbackCacheMissesRef = useRef<number[]>([]);
  const [playbackLastGoodItems, setPlaybackLastGoodItems] = useState<SessionWindowPoint[]>([]);
  const [mapLayerMode, setMapLayerMode] = useState<'points' | 'coverage'>('points');
  const [coverageVisualizationMode, setCoverageVisualizationMode] = useState<'bins' | 'heatmap'>(
    'bins'
  );
  const [coverageScope, setCoverageScope] = useState<CoverageScope>('device');
  const [selectedCoverageSessionId, setSelectedCoverageSessionId] = useState<string | null>(null);
  const [coverageMetric, setCoverageMetric] = useState<'count' | 'rssiAvg' | 'snrAvg'>('count');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => readInitialSidebarTab());
  const sidebarTabRef = useRef<SidebarTab>(sidebarTab);
  const [zenMode, setZenMode] = useState<boolean>(() => readStoredZenMode());
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readStoredThemeMode());
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(() => readSystemTheme());
  const [showPoints, setShowPoints] = useState(initial.showPoints);
  const [showTrack, setShowTrack] = useState(initial.showTrack);
  const [showCoverageTracks, setShowCoverageTracks] = useState<boolean>(() =>
    readStoredShowCoverageTracks()
  );
  const [showDeviceMarkers, setShowDeviceMarkers] = useState<boolean>(() => readStoredShowDeviceMarkers());
  const [showHomeGeofenceOverride, setShowHomeGeofenceOverride] = useState<boolean | null>(() =>
    readStoredShowHomeGeofence(initial.deviceId)
  );
  const [pointDetailsCollapsed, setPointDetailsCollapsed] = useState<boolean>(() =>
    readStoredBoolean(POINT_DETAILS_COLLAPSED_KEY)
  );
  const [statsPanelCollapsed, setStatsPanelCollapsed] = useState<boolean>(() =>
    readStoredBoolean(STATS_PANEL_COLLAPSED_KEY)
  );
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [receiverSource, setReceiverSource] = useState<'lorawan' | 'meshtastic'>('lorawan');
  const [receiverSourceOverridden, setReceiverSourceOverridden] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | null>(null);
  const [compareReceiverId, setCompareReceiverId] = useState<string | null>(null);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);
  const [compareGatewayId, setCompareGatewayId] = useState<string | null>(null);
  const [userInteractedWithMap, setUserInteractedWithMap] = useState(false);
  const [fitFeedback, setFitFeedback] = useState<string | null>(null);
  const [sessionSelectionNotice, setSessionSelectionNotice] = useState<string | null>(null);
  const [eventsNavigationNonce, setEventsNavigationNonce] = useState(0);
  const [eventsNavigationRequest, setEventsNavigationRequest] =
    useState<EventsNavigationInput | null>(null);
  const [tourMenuOpen, setTourMenuOpen] = useState(false);
  const [tourResetNotice, setTourResetNotice] = useState<string | null>(null);
  const tourMenuOpenRef = useRef(tourMenuOpen);
  const [tourForceRightPanelExpanded, setTourForceRightPanelExpanded] = useState(false);
  const tourForceRightPanelExpandedRef = useRef(tourForceRightPanelExpanded);
  const tourMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    sidebarTabRef.current = sidebarTab;
  }, [sidebarTab]);

  useEffect(() => {
    tourMenuOpenRef.current = tourMenuOpen;
  }, [tourMenuOpen]);

  useEffect(() => {
    tourForceRightPanelExpandedRef.current = tourForceRightPanelExpanded;
  }, [tourForceRightPanelExpanded]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.tourSetActiveTab = (tab: TourSidebarTabKey) => {
      flushSync(() => {
        setSidebarTab(tab as SidebarTab);
      });
    };
    window.tourGetActiveTab = () => sidebarTabRef.current;
    window.tourSetHelpPopoverOpen = (open: boolean) => {
      flushSync(() => {
        setTourMenuOpen(open);
        if (!open) {
          setTourResetNotice(null);
        }
      });
    };
    window.tourGetHelpPopoverOpen = () => tourMenuOpenRef.current;
    window.tourSetRightPanelExpanded = (expanded: boolean) => {
      flushSync(() => {
        setTourForceRightPanelExpanded(expanded);
      });
    };
    window.tourGetRightPanelExpanded = () => tourForceRightPanelExpandedRef.current;

    return () => {
      delete window.tourSetActiveTab;
      delete window.tourGetActiveTab;
      delete window.tourSetHelpPopoverOpen;
      delete window.tourGetHelpPopoverOpen;
      delete window.tourSetRightPanelExpanded;
      delete window.tourGetRightPanelExpanded;
    };
  }, []);

  useEffect(() => {
    playbackCursorRef.current = playbackCursorMs;
  }, [playbackCursorMs]);

  useEffect(() => {
    setPresetAnchorMs(Date.now());
  }, [exploreRangePreset]);

  useEffect(() => {
    if (compareSessionIds.length < 2) {
      return;
    }
    if (viewMode !== 'explore') {
      setViewMode('explore');
    }
    setPlaybackIsPlaying(false);
    setSelectedPointId(null);
  }, [compareSessionIds, viewMode]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedBbox(bbox);
    }, BBOX_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [bbox]);

  useEffect(() => {
    if (mapLayerMode !== 'coverage' || coverageVisualizationMode !== 'bins') {
      if (coverageBinsBboxCommitTimerRef.current !== null) {
        window.clearTimeout(coverageBinsBboxCommitTimerRef.current);
        coverageBinsBboxCommitTimerRef.current = null;
      }
      return;
    }
    if (!bbox) {
      return;
    }

    if (coverageBinsBboxCommitTimerRef.current !== null) {
      window.clearTimeout(coverageBinsBboxCommitTimerRef.current);
    }

    coverageBinsBboxCommitTimerRef.current = window.setTimeout(() => {
      coverageBinsBboxCommitTimerRef.current = null;
      setCoverageBinsBboxCommitted((previous) =>
        areBboxesEqual(previous, bbox) ? previous : bbox
      );
    }, 150);

    return () => {
      if (coverageBinsBboxCommitTimerRef.current !== null) {
        window.clearTimeout(coverageBinsBboxCommitTimerRef.current);
        coverageBinsBboxCommitTimerRef.current = null;
      }
    };
  }, [bbox, mapLayerMode, coverageVisualizationMode]);

  useEffect(() => {
    if (
      mapLayerMode !== 'coverage' ||
      coverageVisualizationMode !== 'bins' ||
      coverageBinsBboxCommitted ||
      !bbox
    ) {
      return;
    }
    const handle = window.setTimeout(() => {
      setCoverageBinsBboxCommitted((previous) =>
        areBboxesEqual(previous, bbox) ? previous : bbox
      );
    }, 0);
    return () => window.clearTimeout(handle);
  }, [mapLayerMode, coverageVisualizationMode, coverageBinsBboxCommitted, bbox]);

  useEffect(() => {
    return () => {
      if (coverageBinsBboxCommitTimerRef.current !== null) {
        window.clearTimeout(coverageBinsBboxCommitTimerRef.current);
        coverageBinsBboxCommitTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SIDEBAR_TAB_KEY, sidebarTab);
  }, [sidebarTab]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(ZEN_MODE_KEY, zenMode ? 'true' : 'false');
  }, [zenMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(THEME_MODE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(SHOW_DEVICE_MARKERS_KEY, showDeviceMarkers ? 'true' : 'false');
  }, [showDeviceMarkers]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      SHOW_COVERAGE_TRACKS_KEY,
      showCoverageTracks ? 'true' : 'false'
    );
  }, [showCoverageTracks]);

  useEffect(() => {
    setShowHomeGeofenceOverride(readStoredShowHomeGeofence(deviceId));
  }, [deviceId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(
      POINT_DETAILS_COLLAPSED_KEY,
      pointDetailsCollapsed ? 'true' : 'false'
    );
  }, [pointDetailsCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(STATS_PANEL_COLLAPSED_KEY, statsPanelCollapsed ? 'true' : 'false');
  }, [statsPanelCollapsed]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const update = (matches: boolean) => setSystemTheme(matches ? 'dark' : 'light');
    update(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      update(event.matches);
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      return () => mediaQuery.removeEventListener('change', handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, []);

  const effectiveTheme: EffectiveTheme = themeMode === 'system' ? systemTheme : themeMode;

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    document.documentElement.dataset.theme = effectiveTheme;
  }, [effectiveTheme]);

  useEffect(() => {
    if (!fitFeedback) {
      return;
    }
    const handle = window.setTimeout(() => {
      setFitFeedback(null);
    }, 2200);
    return () => window.clearTimeout(handle);
  }, [fitFeedback]);

  useEffect(() => {
    if (!sessionSelectionNotice) {
      return;
    }
    const handle = window.setTimeout(() => {
      setSessionSelectionNotice(null);
    }, 3200);
    return () => window.clearTimeout(handle);
  }, [sessionSelectionNotice]);

  useEffect(() => {
    if (!tourMenuOpen || isTourActive) {
      return;
    }
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!target || !(target instanceof Node)) {
        return;
      }
      if (tourMenuRef.current?.contains(target)) {
        return;
      }
      setTourMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setTourMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [tourMenuOpen, isTourActive]);

  useEffect(() => {
    if (!isTourActive) {
      return;
    }
    setTourMenuOpen(false);
    setTourResetNotice(null);
  }, [isTourActive]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (isTypingTarget(event.target)) {
        return;
      }
      if (event.key.toLowerCase() !== 'z') {
        return;
      }
      event.preventDefault();
      setZenMode((value) => !value);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const setOptional = (key: string, value: string | null) => {
      if (!value) {
        params.delete(key);
        return;
      }
      params.set(key, value);
    };

    setOptional('deviceId', deviceId);
    params.set('filterMode', filterMode);
    setOptional('sessionId', selectedSessionId);
    setOptional('compareSessionIds', compareSessionIds.length > 0 ? compareSessionIds.join(',') : null);
    params.set('rangePreset', exploreRangePreset);
    if (useAdvancedRange) {
      params.set('rangeAdvanced', 'true');
      setOptional('from', from || null);
      setOptional('to', to || null);
    } else {
      params.delete('rangeAdvanced');
      params.delete('from');
      params.delete('to');
    }
    if (!showPoints) {
      params.set('showPoints', 'false');
    } else {
      params.delete('showPoints');
    }
    if (!showTrack) {
      params.set('showTrack', 'false');
    } else {
      params.delete('showTrack');
    }
    params.set('viewMode', viewMode);
    setOptional('playbackSessionId', playbackSessionId);
    if (Number.isFinite(playbackCursorMs)) {
      params.set('playbackCursor', new Date(playbackCursorMs).toISOString());
    } else {
      params.delete('playbackCursor');
    }
    if (Number.isFinite(playbackWindowMs)) {
      params.set('playbackWindowMinutes', String(Math.round(playbackWindowMs / 60000)));
    } else {
      params.delete('playbackWindowMinutes');
    }
    params.set('playbackSpeed', String(playbackSpeed));
    params.set('tab', sidebarTab);

    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [
    deviceId,
    filterMode,
    selectedSessionId,
    compareSessionIds,
    from,
    to,
    showPoints,
    showTrack,
    exploreRangePreset,
    useAdvancedRange,
    viewMode,
    playbackSessionId,
    playbackCursorMs,
    playbackWindowMs,
    playbackSpeed,
    sidebarTab
  ]);

  const handleFilterModeChange = (mode: 'time' | 'session') => {
    setFilterMode(mode);
    if (mode === 'session') {
      setFrom('');
      setTo('');
    } else {
      setSelectedSessionId(null);
    }
  };

  const handleReceiverSourceChange = (source: 'lorawan' | 'meshtastic') => {
    setReceiverSource(source);
    setReceiverSourceOverridden(true);
    setSelectedReceiverId(null);
    setCompareReceiverId(null);
    setSelectedGatewayId(null);
    setCompareGatewayId(null);
  };

  const handleExploreRangePresetChange = (preset: ExploreRangePreset) => {
    setExploreRangePreset(preset);
  };

  const handlePlaybackCursorMsChange = useCallback((value: number) => {
    setPlaybackCursorMs(value);
    if (playbackIsPlaying) {
      playbackStartRef.current = Date.now();
      playbackStartCursorRef.current = value;
      playbackStepRef.current = 0;
    }
  }, [playbackIsPlaying]);

  const handleUseAdvancedRangeChange = (value: boolean) => {
    setUseAdvancedRange(value);
    if (!value) {
      setPresetAnchorMs(Date.now());
    }
  };

  const handleSessionStart = (sessionId: string) => {
    handleFilterModeChange('session');
    setSelectedSessionId(sessionId);
  };

  const handleToggleCompareSelection = useCallback((sessionId: string) => {
    setCompareSelectionIds((current) => {
      if (current.includes(sessionId)) {
        return current.filter((id) => id !== sessionId);
      }
      if (current.length >= MAX_COMPARED_SESSIONS) {
        return current;
      }
      return [...current, sessionId];
    });
  }, []);

  const handleStartComparison = useCallback(() => {
    const nextIds = compareSelectionIds.slice(0, MAX_COMPARED_SESSIONS);
    if (nextIds.length < 2) {
      return;
    }
    setCompareSessionIds(nextIds);
    setCompareSelectionIds(nextIds);
    setHiddenComparisonSessionIds([]);
    setSidebarTab('sessions');
    setViewMode('explore');
    setPlaybackIsPlaying(false);
    setMapLayerMode('points');
    setSelectedPointId(null);
  }, [compareSelectionIds]);

  const handleClearCompareSelection = useCallback(() => {
    setCompareSelectionIds([]);
    setCompareSessionIds([]);
    setHiddenComparisonSessionIds([]);
  }, []);

  const handleExitComparison = useCallback(() => {
    setCompareSessionIds([]);
    setHiddenComparisonSessionIds([]);
    setSelectedPointId(null);
  }, []);

  const handleToggleComparedSessionVisibility = useCallback((sessionId: string) => {
    setHiddenComparisonSessionIds((current) =>
      current.includes(sessionId)
        ? current.filter((id) => id !== sessionId)
        : [...current, sessionId]
    );
  }, []);

  const handleOpenEvents = useCallback((input: EventsNavigationInput) => {
    if (typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    applyEventsNavigationParams(params, input);
    params.set('tab', 'debug');

    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
    setEventsNavigationRequest(input);
    setSidebarTab('debug');
    setEventsNavigationNonce((value) => value + 1);
  }, []);

  const handleBoundsChange = useCallback((nextBbox: [number, number, number, number]) => {
    setBbox((previous) => (areBboxesEqual(previous, nextBbox) ? previous : nextBbox));
    setPointsBboxCommitted((previous) =>
      areBboxesEqual(previous, nextBbox) ? previous : nextBbox
    );
  }, []);

  const bboxPayload = useMemo(
    () =>
      debouncedBbox
        ? {
            minLon: debouncedBbox[0],
            minLat: debouncedBbox[1],
            maxLon: debouncedBbox[2],
            maxLat: debouncedBbox[3]
          }
        : undefined,
    [debouncedBbox]
  );
  const pointsBboxPayload = useMemo(
    () =>
      pointsBboxCommitted
        ? {
            minLon: pointsBboxCommitted[0],
            minLat: pointsBboxCommitted[1],
            maxLon: pointsBboxCommitted[2],
            maxLat: pointsBboxCommitted[3]
          }
        : undefined,
    [pointsBboxCommitted]
  );

  const compareSessionIdsKey = compareSessionIds.join(',');
  const isSessionMode = filterMode === 'session';
  const isCompareMode = compareSessionIds.length >= 2;
  const comparisonSelectionDirty = !areStringListsEqual(compareSelectionIds, compareSessionIds);
  const isPlaybackMode = viewMode === 'playback';
  const focusedCoverageSessionId = isPlaybackMode
    ? playbackSessionId
    : isSessionMode
      ? selectedSessionId
      : null;
  const effectiveCoverageSessionId =
    coverageScope === 'session' ? selectedCoverageSessionId : null;
  const hasPlaybackSession = Boolean(playbackSessionId);
  const isMeshtasticSource = receiverSource === 'meshtastic';

  const playbackTimelineQuery = useSessionTimeline(playbackSessionId ?? undefined, {
    enabled: Boolean(playbackSessionId)
  });
  const sessionPickerQuery = useSessions(deviceId ?? undefined, { enabled: Boolean(deviceId) });
  const coverageSessionOptions = sessionPickerQuery.data?.items ?? [];
  const playbackSessionSummary = useMemo(
    () =>
      playbackSessionId
        ? (sessionPickerQuery.data?.items ?? []).find((session) => session.id === playbackSessionId) ?? null
        : null,
    [sessionPickerQuery.data?.items, playbackSessionId]
  );
  const selectedCoverageSessionSummary = useMemo(
    () =>
      effectiveCoverageSessionId
        ? coverageSessionOptions.find((session) => session.id === effectiveCoverageSessionId) ?? null
        : null,
    [coverageSessionOptions, effectiveCoverageSessionId]
  );
  const nonArchivedSessionIds = useMemo(
    () => new Set((sessionPickerQuery.data?.items ?? []).map((session) => session.id)),
    [sessionPickerQuery.data?.items]
  );
  const comparedSessionLookup = useMemo(
    () =>
      new Map<string, Session>((sessionPickerQuery.data?.items ?? []).map((session) => [session.id, session])),
    [sessionPickerQuery.data?.items]
  );
  const comparisonStatsQueries = useQueries({
    queries: compareSessionIds.map((sessionId) => ({
      queryKey: ['sessionStats', sessionId],
      queryFn: ({ signal }) => getSessionStats(sessionId, { signal }),
      enabled: isCompareMode
    }))
  });
  const comparisonOverviewQueries = useQueries({
    queries: compareSessionIds.map((sessionId) => ({
      queryKey: ['sessionOverview', sessionId, COMPARISON_TRACK_SAMPLE],
      queryFn: ({ signal }) =>
        getSessionOverview(sessionId, { sample: COMPARISON_TRACK_SAMPLE }, { signal }),
      enabled: isCompareMode
    }))
  });
  const playbackMinMs = useMemo(() => {
    if (!playbackTimelineQuery.data?.minCapturedAt) {
      return null;
    }
    const parsed = new Date(playbackTimelineQuery.data.minCapturedAt).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }, [playbackTimelineQuery.data?.minCapturedAt]);
  const playbackMaxMs = useMemo(() => {
    if (!playbackTimelineQuery.data?.maxCapturedAt) {
      return null;
    }
    const parsed = new Date(playbackTimelineQuery.data.maxCapturedAt).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }, [playbackTimelineQuery.data?.maxCapturedAt]);
  const isExploreMode = viewMode === 'explore';
  const exploreRange = useMemo(() => {
    if (!isExploreMode || filterMode !== 'time') {
      return { from: undefined, to: undefined };
    }
    if (useAdvancedRange) {
      return {
        from: from || undefined,
        to: to || undefined
      };
    }
    if (exploreRangePreset === 'all') {
      return { from: undefined, to: undefined };
    }
    const presetRange = computePresetRange(exploreRangePreset, presetAnchorMs);
    return {
      from: presetRange?.from,
      to: presetRange?.to
    };
  }, [isExploreMode, filterMode, useAdvancedRange, from, to, exploreRangePreset, presetAnchorMs]);

  const effectiveLimit = currentZoom <= LIMIT_ZOOM_THRESHOLD ? LOW_ZOOM_LIMIT : DEFAULT_LIMIT;
  const effectiveSample =
    currentZoom <= SAMPLE_ZOOM_LOW ? 800 : currentZoom <= SAMPLE_ZOOM_MEDIUM ? 1500 : undefined;
  const playbackSampling = useMemo(() => {
    let sample: number | undefined;
    let limit: number;

    if (currentZoom <= 12) {
      sample = 600;
      limit = 2000;
    } else if (currentZoom <= 14) {
      sample = 1200;
      limit = 3000;
    } else {
      sample = undefined;
      limit = 5000;
    }

    if (playbackWindowMs >= 30 * 60 * 1000) {
      sample = typeof sample === 'number' ? Math.min(sample, 1000) : 1000;
    }

    return { sample, limit };
  }, [currentZoom, playbackWindowMs]);

  const playbackWindowParams = useMemo(
    () => ({
      sessionId: playbackSessionId ?? '',
      cursor: new Date(playbackCursorMs),
      windowMs: playbackWindowMs,
      sample: playbackSampling.sample,
      limit: playbackSampling.limit
    }),
    [playbackSessionId, playbackCursorMs, playbackWindowMs, playbackSampling]
  );
  const playbackOverviewTrackParams = useMemo<MeasurementQueryParams>(
    () => ({
      sessionId: playbackSessionId ?? undefined,
      sample: playbackSampling.sample,
      limit: playbackSampling.limit
    }),
    [playbackSessionId, playbackSampling]
  );

  const exploreEnabled = viewMode !== 'playback' && !isCompareMode;
  const isCoverageExploreMode = exploreEnabled && mapLayerMode === 'coverage';
  const scopedExploreSessionId =
    isCoverageExploreMode
      ? coverageScope === 'session'
        ? effectiveCoverageSessionId
        : null
      : isSessionMode
        ? selectedSessionId
        : null;
  const scopedExploreDeviceId =
    isCoverageExploreMode && coverageScope === 'device'
      ? deviceId
      : !isCoverageExploreMode && !isSessionMode
        ? deviceId
        : null;
  const scopedExploreFrom =
    isCoverageExploreMode && coverageScope === 'device' ? undefined : exploreRange.from;
  const scopedExploreTo =
    isCoverageExploreMode && coverageScope === 'device' ? undefined : exploreRange.to;
  const exploreScopeEnabled = Boolean(scopedExploreSessionId || scopedExploreDeviceId);
  const exploreQueryFilterMode: 'time' | 'session' = scopedExploreSessionId ? 'session' : 'time';
  const sessionBoundOnlyForCoverageDevice = isCoverageExploreMode && coverageScope === 'device';
  const playbackEnabled = isPlaybackMode && hasPlaybackSession && !isCompareMode;
  const sessionPolling = exploreEnabled && Boolean(scopedExploreSessionId) ? 2000 : false;
  const exploreMeasurementsBboxPayload =
    mapLayerMode === 'points' ? pointsBboxPayload : bboxPayload;
  const effectiveExploreMeasurementsParams = useMemo<MeasurementQueryParams>(() => {
    const receiverId = isMeshtasticSource ? selectedReceiverId ?? undefined : undefined;
    const rxGatewayId = !isMeshtasticSource ? selectedGatewayId ?? undefined : undefined;
    if (scopedExploreSessionId) {
      return {
        sessionId: scopedExploreSessionId,
        bbox: exploreMeasurementsBboxPayload,
        receiverId,
        rxGatewayId,
        sessionBoundOnly: sessionBoundOnlyForCoverageDevice,
        sample: effectiveSample,
        limit: effectiveLimit
      };
    }
    return {
      deviceId: scopedExploreDeviceId ?? undefined,
      from: scopedExploreFrom,
      to: scopedExploreTo,
      bbox: exploreMeasurementsBboxPayload,
      receiverId,
      rxGatewayId,
      sessionBoundOnly: sessionBoundOnlyForCoverageDevice,
      sample: effectiveSample,
      limit: effectiveLimit
    };
  }, [
    scopedExploreSessionId,
    scopedExploreDeviceId,
    scopedExploreFrom,
    scopedExploreTo,
    exploreMeasurementsBboxPayload,
    selectedGatewayId,
    selectedReceiverId,
    isMeshtasticSource,
    sessionBoundOnlyForCoverageDevice,
    effectiveSample,
    effectiveLimit
  ]);
  const effectiveExploreTrackParams = useMemo<MeasurementQueryParams>(() => {
    const receiverId = isMeshtasticSource ? selectedReceiverId ?? undefined : undefined;
    const rxGatewayId = !isMeshtasticSource ? selectedGatewayId ?? undefined : undefined;
    if (scopedExploreSessionId) {
      return {
        sessionId: scopedExploreSessionId,
        receiverId,
        rxGatewayId,
        sessionBoundOnly: sessionBoundOnlyForCoverageDevice,
        sample: effectiveSample,
        limit: effectiveLimit
      };
    }
    return {
      deviceId: scopedExploreDeviceId ?? undefined,
      from: scopedExploreFrom,
      to: scopedExploreTo,
      receiverId,
      rxGatewayId,
      sessionBoundOnly: sessionBoundOnlyForCoverageDevice,
      sample: effectiveSample,
      limit: effectiveLimit
    };
  }, [
    scopedExploreSessionId,
    scopedExploreDeviceId,
    scopedExploreFrom,
    scopedExploreTo,
    selectedGatewayId,
    selectedReceiverId,
    isMeshtasticSource,
    sessionBoundOnlyForCoverageDevice,
    effectiveSample,
    effectiveLimit
  ]);

  const exploreMeasurementsQuery = useMeasurements(
    effectiveExploreMeasurementsParams,
    {
      enabled: exploreEnabled && exploreScopeEnabled,
      placeholderData: keepPreviousData
    },
    { filterMode: exploreQueryFilterMode, refetchIntervalMs: sessionPolling }
  );
  const exploreTrackQuery = useTrack(
    effectiveExploreTrackParams,
    {
      enabled: exploreEnabled && exploreScopeEnabled
    },
    { filterMode: exploreQueryFilterMode, refetchIntervalMs: sessionPolling }
  );
  const playbackWindowQuery = useSessionWindow(playbackWindowParams, {
    enabled: playbackEnabled,
    placeholderData: keepPreviousData,
    refetchInterval: playbackIsPlaying ? playbackRefetchIntervalMs : false
  });
  const playbackOverviewTrackQuery = useTrack(
    playbackOverviewTrackParams,
    { enabled: playbackEnabled },
    { filterMode: 'session', refetchIntervalMs: false }
  );
  const compareId = receiverSource === 'lorawan' ? compareGatewayId : compareReceiverId;
  const compareSample = compareId && !isPlaybackMode ? 800 : undefined;
  const compareMeasurementsParams = useMemo<MeasurementQueryParams>(() => {
    const rxGatewayId = receiverSource === 'lorawan' ? compareGatewayId ?? undefined : undefined;
    const receiverId = receiverSource === 'meshtastic' ? compareReceiverId ?? undefined : undefined;
    if (isSessionMode) {
      return {
        sessionId: selectedSessionId ?? undefined,
        bbox: pointsBboxPayload,
        receiverId,
        rxGatewayId,
        sample: compareSample,
        limit: effectiveLimit
      };
    }
    return {
      deviceId: deviceId ?? undefined,
      from: exploreRange.from,
      to: exploreRange.to,
      bbox: pointsBboxPayload,
      receiverId,
      rxGatewayId,
      sample: compareSample,
      limit: effectiveLimit
    };
  }, [
    isSessionMode,
    selectedSessionId,
    pointsBboxPayload,
    compareGatewayId,
    compareReceiverId,
    receiverSource,
    compareSample,
    effectiveLimit,
    deviceId,
    exploreRange.from,
    exploreRange.to
  ]);
  const compareMeasurementsQuery = useMeasurements(
    compareMeasurementsParams,
    {
      enabled:
        exploreEnabled &&
        mapLayerMode === 'points' &&
        Boolean(compareId) &&
        (isSessionMode ? Boolean(selectedSessionId) : Boolean(deviceId)),
      placeholderData: keepPreviousData
    },
    { filterMode, refetchIntervalMs: sessionPolling }
  );

  const playbackWindowItems = useMemo(() => {
    const items = playbackWindowQuery.data?.items ?? [];
    if (items.length > 0) {
      return items;
    }
    return playbackLastGoodItems;
  }, [playbackWindowQuery.data?.items, playbackLastGoodItems]);
  const playbackWindowEmpty =
    playbackWindowQuery.data !== undefined && playbackWindowQuery.data.items.length === 0;

  useEffect(() => {
    const items = playbackWindowQuery.data?.items ?? [];
    if (items.length > 0) {
      setPlaybackLastGoodItems(items);
    }
  }, [playbackWindowQuery.data?.items]);

  const playbackWindowPoints = useMemo(() => {
    if (!isPlaybackMode) {
      return [];
    }
    const items = playbackWindowItems;
    return [...items].sort(
      (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
    );
  }, [isPlaybackMode, playbackWindowItems]);

  const playbackTimedPoints = useMemo(
    () =>
      playbackWindowPoints
        .map((point) => ({
          time: new Date(point.capturedAt).getTime(),
          lat: point.lat,
          lon: point.lon
        }))
        .filter((point) => Number.isFinite(point.time)),
    [playbackWindowPoints]
  );

  const playbackTrackPoints = useMemo(
    () =>
      playbackWindowPoints.map((point) => ({
        lat: point.lat,
        lon: point.lon,
        capturedAt: point.capturedAt
      })),
    [playbackWindowPoints]
  );
  const playbackOverviewTrack = useMemo(
    () => playbackOverviewTrackQuery.data?.items ?? [],
    [playbackOverviewTrackQuery.data?.items]
  );

  const playbackCursorPosition = useMemo(() => {
    if (!isPlaybackMode || playbackTimedPoints.length === 0) {
      return null;
    }
    if (playbackTimedPoints.length === 1) {
      return [playbackTimedPoints[0].lat, playbackTimedPoints[0].lon] as [number, number];
    }

    const cursor = playbackCursorMs;
    if (cursor <= playbackTimedPoints[0].time) {
      return [playbackTimedPoints[0].lat, playbackTimedPoints[0].lon] as [number, number];
    }

    const GAP_THRESHOLD_MS = 10_000;

    for (let i = 1; i < playbackTimedPoints.length; i += 1) {
      const prev = playbackTimedPoints[i - 1];
      const next = playbackTimedPoints[i];
      if (cursor <= next.time) {
        const gap = next.time - prev.time;
        if (gap > GAP_THRESHOLD_MS && cursor < next.time) {
          return [prev.lat, prev.lon] as [number, number];
        }
        if (next.time === prev.time) {
          return [next.lat, next.lon] as [number, number];
        }
        const ratio = (cursor - prev.time) / (next.time - prev.time);
        const lat = prev.lat + (next.lat - prev.lat) * ratio;
        const lon = prev.lon + (next.lon - prev.lon) * ratio;
        return [lat, lon] as [number, number];
      }
    }

    const last = playbackTimedPoints[playbackTimedPoints.length - 1];
    return [last.lat, last.lon] as [number, number];
  }, [isPlaybackMode, playbackTimedPoints, playbackCursorMs]);

  const activeMeasurements = isPlaybackMode
    ? playbackWindowPoints
    : exploreMeasurementsQuery.data?.items ?? [];
  const activeTrack = isPlaybackMode ? playbackTrackPoints : exploreTrackQuery.data?.items ?? [];
  const activeCompareMeasurements = isPlaybackMode
    ? []
    : compareMeasurementsQuery.data?.items ?? [];
  const mapMeasurements = useMemo(() => {
    return activeMeasurements
      .map((point) => normalizeLatLonItem(point))
      .filter((point): point is NonNullable<typeof point> => point !== null);
  }, [activeMeasurements]);
  const mapTrackPoints = useMemo(() => {
    return activeTrack
      .map((point) => normalizeLatLonItem(point))
      .filter((point): point is NonNullable<typeof point> => point !== null);
  }, [activeTrack]);
  const mapCompareMeasurements = useMemo(() => {
    return activeCompareMeasurements
      .map((point) => normalizeLatLonItem(point))
      .filter((point): point is NonNullable<typeof point> => point !== null);
  }, [activeCompareMeasurements]);
  const mapOverviewTrack = useMemo(() => {
    return playbackOverviewTrack
      .map((point) => normalizeLatLonItem(point))
      .filter((point): point is NonNullable<typeof point> => point !== null);
  }, [playbackOverviewTrack]);
  const comparisonItems = useMemo<SessionComparisonItem[]>(
    () =>
      compareSessionIds.map((sessionId, index) => {
        const session = comparedSessionLookup.get(sessionId) ?? null;
        const stats = comparisonStatsQueries[index]?.data ?? null;
        const itemError =
          comparisonStatsQueries[index]?.error ?? comparisonOverviewQueries[index]?.error ?? null;

        return {
          id: sessionId,
          label: session ? formatSessionLabel(session) : `Session ${sessionId.slice(0, 8)}`,
          startedAt: session?.startedAt ?? stats?.startedAt ?? null,
          durationMs: buildSessionDurationMs(session, stats),
          measurementCount: stats?.pointCount ?? null,
          distanceMeters: stats?.distanceMeters ?? null,
          medianRssi: stats?.rssi?.median ?? null,
          medianSnr: stats?.snr?.median ?? null,
          farthestPoint: stats?.farthestPoint ?? null,
          lastRangePoint: stats?.lastRangePoint ?? null,
          isVisible: !hiddenComparisonSessionIds.includes(sessionId),
          isLoading:
            comparisonStatsQueries[index]?.isLoading === true ||
            comparisonOverviewQueries[index]?.isLoading === true,
          error: itemError instanceof Error ? itemError.message : null,
          style: getSessionComparisonStyle(index)
        };
      }),
    [
      compareSessionIds,
      comparedSessionLookup,
      comparisonOverviewQueries,
      comparisonStatsQueries,
      hiddenComparisonSessionIds
    ]
  );
  const comparisonTracks = useMemo(
    () =>
      compareSessionIds.map((sessionId, index) => {
        const overviewTrackItems = comparisonOverviewQueries[index]?.data?.items ?? [];
        return {
          id: sessionId,
          label: comparisonItems[index]?.label ?? `Session ${sessionId.slice(0, 8)}`,
          color: comparisonItems[index]?.style.color ?? getSessionComparisonStyle(index).color,
          dashArray: comparisonItems[index]?.style.dashArray,
          isVisible: !hiddenComparisonSessionIds.includes(sessionId),
          track: overviewTrackItems
            .map((point) => normalizeLatLonItem(point))
            .filter((point): point is NonNullable<typeof point> => point !== null)
        };
      }),
    [compareSessionIds, comparisonItems, comparisonOverviewQueries, hiddenComparisonSessionIds]
  );
  const comparisonHighlights = useMemo(
    () =>
      compareSessionIds
        .map((sessionId, index) => {
          const farthestPoint = comparisonStatsQueries[index]?.data?.farthestPoint ?? null;
          if (!farthestPoint) {
            return null;
          }

          return {
            id: sessionId,
            label: comparisonItems[index]?.label ?? `Session ${sessionId.slice(0, 8)}`,
            color: comparisonItems[index]?.style.color ?? getSessionComparisonStyle(index).color,
            dashArray: comparisonItems[index]?.style.dashArray,
            isVisible: !hiddenComparisonSessionIds.includes(sessionId),
            lat: farthestPoint.lat,
            lon: farthestPoint.lon,
            distanceMeters: farthestPoint.distanceMeters,
            rssi: farthestPoint.rssi,
            snr: farthestPoint.snr
          };
        })
        .filter((highlight): highlight is NonNullable<typeof highlight> => highlight !== null),
    [compareSessionIds, comparisonItems, comparisonStatsQueries, hiddenComparisonSessionIds]
  );
  const comparisonFitPoints = useMemo<LatLonPoint[]>(() => {
    const highlightPoints = comparisonHighlights
      .filter((highlight) => highlight.isVisible !== false)
      .map((highlight) => toLatLonPoint(highlight.lat, highlight.lon))
      .filter((point): point is LatLonPoint => point !== null);
    const trackPoints = comparisonTracks
      .filter((trackLayer) => trackLayer.isVisible !== false)
      .flatMap((trackLayer) =>
        trackLayer.track
          .map((point) => toLatLonPoint(point.lat, point.lon))
          .filter((point): point is LatLonPoint => point !== null)
      );
    if (trackPoints.length > 0) {
      return [...trackPoints, ...highlightPoints];
    }

    if (highlightPoints.length > 0) {
      return highlightPoints;
    }

    return comparisonItems
      .filter((item) => item.isVisible)
      .flatMap((item, index) => {
        const bbox = comparisonStatsQueries[index]?.data?.bbox;
        if (!bbox) {
          return [];
        }
        const southWest = toLatLonPoint(bbox.minLat, bbox.minLon);
        const northEast = toLatLonPoint(bbox.maxLat, bbox.maxLon);
        return southWest && northEast ? [southWest, northEast] : [];
      });
  }, [comparisonHighlights, comparisonItems, comparisonStatsQueries, comparisonTracks]);
  const handleSelectEventForMap = useCallback((event: UnifiedEventListItem) => {
    const candidates = mapMeasurements as Array<{
      id: string;
      lat: number;
      lon: number;
      capturedAt?: string;
      deviceUid?: string | null;
      eventId?: string | null;
    }>;
    if (candidates.length === 0) {
      setSelectedPointId(null);
      return;
    }

    const exactMatch = candidates.find((point) => point.eventId === event.id);
    if (exactMatch) {
      setSelectedPointId(exactMatch.id);
      return;
    }

    const targetTimeMs = toTimestampMs(event.time) ?? toTimestampMs(event.receivedAt);
    const targetLat =
      typeof event.lat === 'number' && Number.isFinite(event.lat) ? event.lat : null;
    const targetLon =
      typeof event.lon === 'number' && Number.isFinite(event.lon) ? event.lon : null;
    const targetDeviceUid = typeof event.deviceUid === 'string' ? event.deviceUid.trim() : '';
    const hasTargetCoordinates = targetLat !== null && targetLon !== null;

    const hasPointDeviceUid = candidates.some((point) => {
      const pointDeviceUid =
        typeof point.deviceUid === 'string' ? point.deviceUid.trim() : '';
      return pointDeviceUid.length > 0;
    });
    const byDevice = targetDeviceUid
      ? candidates.filter((point) => {
          const pointDeviceUid =
            typeof point.deviceUid === 'string' ? point.deviceUid.trim() : '';
          return pointDeviceUid === targetDeviceUid;
        })
      : [];
    if (targetDeviceUid && hasPointDeviceUid && byDevice.length === 0) {
      setSelectedPointId(null);
      return;
    }
    const pool = byDevice.length > 0 ? byDevice : candidates;

    let bestPoint: (typeof pool)[number] | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    let bestTimeDeltaMs = Number.POSITIVE_INFINITY;
    let bestDistanceMeters = Number.POSITIVE_INFINITY;

    for (const point of pool) {
      const pointTimeMs = toTimestampMs(point.capturedAt);
      const timeDeltaMs =
        targetTimeMs !== null && pointTimeMs !== null
          ? Math.abs(pointTimeMs - targetTimeMs)
          : Number.POSITIVE_INFINITY;
      const distanceMeters =
        hasTargetCoordinates && targetLat !== null && targetLon !== null
          ? getApproxDistanceMeters(targetLat, targetLon, point.lat, point.lon)
          : Number.POSITIVE_INFINITY;
      const score =
        (Number.isFinite(timeDeltaMs) ? timeDeltaMs : 20 * 60 * 1000) +
        (Number.isFinite(distanceMeters) ? distanceMeters * 20 : 0);
      if (score >= bestScore) {
        continue;
      }
      bestScore = score;
      bestPoint = point;
      bestTimeDeltaMs = timeDeltaMs;
      bestDistanceMeters = distanceMeters;
    }

    if (!bestPoint) {
      setSelectedPointId(null);
      return;
    }

    const withinTightTime = Number.isFinite(bestTimeDeltaMs) && bestTimeDeltaMs <= 2 * 60 * 1000;
    const withinTimeAndDistance =
      Number.isFinite(bestTimeDeltaMs) &&
      bestTimeDeltaMs <= 15 * 60 * 1000 &&
      Number.isFinite(bestDistanceMeters) &&
      bestDistanceMeters <= 750;
    const withinDistanceOnly =
      targetTimeMs === null &&
      Number.isFinite(bestDistanceMeters) &&
      bestDistanceMeters <= 500;

    if (withinTightTime || withinTimeAndDistance || withinDistanceOnly) {
      setSelectedPointId(bestPoint.id);
      return;
    }

    setSelectedPointId(null);
  }, [mapMeasurements]);
  const safePlaybackCursorPosition = useMemo<LatLonPoint | null>(() => {
    if (!playbackCursorPosition) {
      return null;
    }
    return toLatLonPoint(playbackCursorPosition[0], playbackCursorPosition[1]);
  }, [playbackCursorPosition]);
  const comparisonLoading =
    isCompareMode &&
    (comparisonStatsQueries.some((query) => query.isLoading) ||
      comparisonOverviewQueries.some((query) => query.isLoading));
  const comparisonError = isCompareMode
    ? comparisonStatsQueries.find((query) => query.error)?.error ??
      comparisonOverviewQueries.find((query) => query.error)?.error ??
      null
    : null;
  const activeMeasurementsQuery = isPlaybackMode
    ? playbackWindowQuery
    : exploreMeasurementsQuery;
  const activeTrackQuery = isPlaybackMode ? null : exploreTrackQuery;
  const effectiveMapLayerMode = isCompareMode ? 'points' : mapLayerMode;
  const playbackWindowSummary = useMemo(() => {
    if (!isPlaybackMode || !playbackWindowQuery.data) {
      return null;
    }
    const { from, to } = playbackWindowQuery.data;
    return {
      from: new Date(from),
      to: new Date(to),
      count: playbackWindowItems.length
    };
  }, [isPlaybackMode, playbackWindowQuery.data, playbackWindowItems.length]);

  const playbackSampleNote = useMemo(() => {
    if (!isPlaybackMode || !playbackWindowQuery.data) {
      return null;
    }
    const { totalBeforeSample, returnedAfterSample } = playbackWindowQuery.data;
    if (totalBeforeSample > returnedAfterSample) {
      return `Sampled ${returnedAfterSample} of ${totalBeforeSample} points`;
    }
    return null;
  }, [isPlaybackMode, playbackWindowQuery.data]);
  const playbackEmptyNote = playbackWindowEmpty ? 'No points in this window' : null;
  const latestActiveMeasurementMs = useMemo(() => {
    let latest: number | null = null;
    for (const measurement of activeMeasurements as Array<{ capturedAt?: string | null }>) {
      const timestamp = toTimestampMs(measurement.capturedAt);
      if (timestamp === null) {
        continue;
      }
      if (latest === null || timestamp > latest) {
        latest = timestamp;
      }
    }
    return latest;
  }, [activeMeasurements]);
  const coverageDay = useMemo(() => {
    if (coverageScope === 'session') {
      return (
        toUtcDayIso(selectedCoverageSessionSummary?.endedAt) ??
        toUtcDayIso(selectedCoverageSessionSummary?.startedAt) ??
        (isPlaybackMode && Number.isFinite(playbackCursorMs)
          ? toUtcDayIso(playbackCursorMs)
          : null) ??
        toUtcDayIso(latestActiveMeasurementMs)
      );
    }
    if (isPlaybackMode) {
      if (Number.isFinite(playbackCursorMs)) {
        return toUtcDayIso(playbackCursorMs);
      }
      return (
        toUtcDayIso(playbackTimelineQuery.data?.maxCapturedAt) ??
        toUtcDayIso(playbackTimelineQuery.data?.minCapturedAt) ??
        toUtcDayIso(playbackTimelineQuery.data?.startedAt) ??
        toUtcDayIso(playbackSessionSummary?.endedAt) ??
        toUtcDayIso(playbackSessionSummary?.startedAt) ??
        toUtcDayIso(latestActiveMeasurementMs)
      );
    }
    return (
      toUtcDayIso(exploreRange.to) ??
      toUtcDayIso(exploreRange.from) ??
      toUtcDayIso(latestActiveMeasurementMs)
    );
  }, [
    coverageScope,
    selectedCoverageSessionSummary?.endedAt,
    selectedCoverageSessionSummary?.startedAt,
    isPlaybackMode,
    playbackCursorMs,
    playbackTimelineQuery.data?.maxCapturedAt,
    playbackTimelineQuery.data?.minCapturedAt,
    playbackTimelineQuery.data?.startedAt,
    playbackSessionSummary?.endedAt,
    playbackSessionSummary?.startedAt,
    latestActiveMeasurementMs,
    exploreRange.to,
    exploreRange.from
  ]);

  const statsParams = useMemo<MeasurementQueryParams>(
    () =>
      isSessionMode
        ? {
            sessionId: selectedSessionId ?? undefined
          }
        : {
            deviceId: deviceId ?? undefined,
            from: exploreRange.from,
            to: exploreRange.to
          },
    [isSessionMode, selectedSessionId, deviceId, exploreRange.from, exploreRange.to]
  );
  const statsQuery = useStats(statsParams, {
    enabled: isSessionMode ? Boolean(selectedSessionId) : Boolean(deviceId)
  });
  const coverageFilterMode: 'time' | 'session' = coverageScope === 'session' ? 'session' : 'time';
  const coverageParams = useMemo<CoverageQueryParams>(() => {
    const gatewayId = receiverSource === 'lorawan' ? selectedGatewayId ?? undefined : undefined;
    const coverageLimit = coverageVisualizationMode === 'heatmap' ? 12000 : undefined;
    const coverageBbox =
      coverageVisualizationMode === 'heatmap'
        ? undefined
        : coverageBinsBboxCommitted ?? undefined;
    if (coverageScope === 'session') {
      return {
        sessionId: effectiveCoverageSessionId ?? undefined,
        day: coverageDay,
        allDays: false,
        bbox: coverageBbox,
        gatewayId,
        limit: coverageLimit
      };
    }
    return {
      deviceId: deviceId ?? undefined,
      allDays: true,
      bbox: coverageBbox,
      gatewayId,
      limit: coverageLimit
    };
  }, [
    coverageScope,
    effectiveCoverageSessionId,
    coverageDay,
    coverageBinsBboxCommitted,
    deviceId,
    selectedGatewayId,
    receiverSource,
    coverageVisualizationMode
  ]);
  const coverageQuery = useCoverageBins(
    coverageParams,
    {
      enabled:
        mapLayerMode === 'coverage' &&
        !isCompareMode &&
        (coverageVisualizationMode === 'heatmap' || Boolean(coverageBinsBboxCommitted)) &&
        (coverageScope === 'session'
          ? Boolean(effectiveCoverageSessionId)
          : Boolean(deviceId)),
      placeholderData: keepPreviousData
    },
    { filterMode: coverageFilterMode }
  );
  const coverageBins = useMemo(
    () =>
      coverageScope === 'device'
        ? mergeCoverageBinsByGateway(coverageQuery.data?.items)
        : (coverageQuery.data?.items ?? []),
    [coverageScope, coverageQuery.data?.items]
  );
  const renderedPointCount =
    effectiveMapLayerMode === 'points'
      ? isCompareMode
        ? comparisonTracks.reduce((sum, trackLayer) => sum + trackLayer.track.length, 0)
        : (showPoints ? mapMeasurements.length : 0) + mapCompareMeasurements.length
      : 0;
  const renderedBinCount = effectiveMapLayerMode === 'coverage' ? coverageBins.length : 0;

  useEffect(() => {
    if (!isPlaybackMode || !hasPlaybackSession || playbackMinMs === null || playbackMaxMs === null) {
      return;
    }
    setPlaybackCursorMs((prev) => {
      if (prev < playbackMinMs) {
        return playbackMinMs;
      }
      if (prev > playbackMaxMs) {
        return playbackMaxMs;
      }
      return prev;
    });
  }, [isPlaybackMode, playbackMinMs, playbackMaxMs]);

  useEffect(() => {
    setPlaybackIsPlaying(false);
  }, [playbackSessionId]);

  useEffect(() => {
    setPlaybackLastGoodItems([]);
  }, [playbackSessionId]);

  useEffect(() => {
    if (!isPlaybackMode || !hasPlaybackSession) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const key = event.key;
      if (key === ' ') {
        event.preventDefault();
        setPlaybackIsPlaying((prev) => !prev);
        return;
      }

      const stepSeconds = event.shiftKey ? 10 : 1;
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault();
        const direction = key === 'ArrowRight' ? 1 : -1;
        const delta = stepSeconds * 1000 * playbackSpeed * direction;
        let next = playbackCursorRef.current + delta;
        if (playbackMinMs !== null) {
          next = Math.max(next, playbackMinMs);
        }
        if (playbackMaxMs !== null) {
          next = Math.min(next, playbackMaxMs);
        }
        handlePlaybackCursorMsChange(next);
        return;
      }

      if (key === 'Home' && playbackMinMs !== null) {
        event.preventDefault();
        handlePlaybackCursorMsChange(playbackMinMs);
        return;
      }
      if (key === 'End' && playbackMaxMs !== null) {
        event.preventDefault();
        handlePlaybackCursorMsChange(playbackMaxMs);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isPlaybackMode,
    hasPlaybackSession,
    playbackSpeed,
    playbackMinMs,
    playbackMaxMs,
    handlePlaybackCursorMsChange
  ]);

  useEffect(() => {
    if (!isPlaybackMode || !hasPlaybackSession || !playbackIsPlaying) {
      playbackStartRef.current = null;
      playbackStepRef.current = 0;
      return;
    }

    const tickMs = 250;
    const stepMs = 1000 * playbackSpeed;
    playbackStartRef.current = Date.now();
    playbackStartCursorRef.current = playbackCursorRef.current;
    playbackStepRef.current = 0;

    const handle = window.setInterval(() => {
      const start = playbackStartRef.current;
      if (!start) {
        return;
      }
      const elapsed = Date.now() - start;
      const steps = Math.floor(elapsed / tickMs);
      if (steps <= playbackStepRef.current) {
        return;
      }
      playbackStepRef.current = steps;

      let nextCursor = playbackStartCursorRef.current + steps * stepMs;
      if (playbackMinMs !== null && nextCursor < playbackMinMs) {
        nextCursor = playbackMinMs;
      }
      if (playbackMaxMs !== null && nextCursor >= playbackMaxMs) {
        nextCursor = playbackMaxMs;
        setPlaybackIsPlaying(false);
        window.clearInterval(handle);
      }
      setPlaybackCursorMs(nextCursor);
    }, tickMs);

    return () => {
      window.clearInterval(handle);
    };
  }, [
    isPlaybackMode,
    hasPlaybackSession,
    playbackIsPlaying,
    playbackSpeed,
    playbackMinMs,
    playbackMaxMs
  ]);

  useEffect(() => {
    if (!isPlaybackMode || !hasPlaybackSession) {
      return;
    }
    const clampCursor = (value: number) => {
      if (playbackMinMs !== null && value < playbackMinMs) {
        return playbackMinMs;
      }
      if (playbackMaxMs !== null && value > playbackMaxMs) {
        return playbackMaxMs;
      }
      return value;
    };

    const cursors = [
      clampCursor(playbackCursorMs - playbackWindowMs),
      clampCursor(playbackCursorMs),
      clampCursor(playbackCursorMs + playbackWindowMs)
    ];

    const uniqueCursors = Array.from(new Set(cursors.filter((value) => Number.isFinite(value))));
    for (const cursor of uniqueCursors) {
      const prefetchParams = {
        sessionId: playbackSessionId ?? '',
        cursor: new Date(cursor),
        windowMs: playbackWindowMs,
        sample: playbackSampling.sample,
        limit: playbackSampling.limit
      };
      const key = buildSessionWindowKey(prefetchParams);
      queryClient.prefetchQuery({
        queryKey: ['sessionWindow', key],
        queryFn: ({ signal }) => getSessionWindow(prefetchParams, { signal })
      });
    }
  }, [
    isPlaybackMode,
    hasPlaybackSession,
    playbackCursorMs,
    playbackWindowMs,
    playbackSessionId,
    playbackMinMs,
    playbackMaxMs,
    playbackSampling,
    queryClient
  ]);

  useEffect(() => {
    if (!playbackIsPlaying || !playbackEnabled) {
      playbackCacheMissesRef.current = [];
      setPlaybackRefetchIntervalMs(1500);
      return;
    }

    const key = buildSessionWindowKey(playbackWindowParams);
    const hasCache = queryClient.getQueryData(['sessionWindow', key]) !== undefined;
    const history = playbackCacheMissesRef.current;
    history.push(hasCache ? 0 : 1);
    if (history.length > 6) {
      history.shift();
    }
    const misses = history.reduce((sum, value) => sum + value, 0);
    const missRatio = history.length > 0 ? misses / history.length : 0;
    const nextInterval = missRatio >= 0.5 ? 1000 : 1500;
    if (nextInterval !== playbackRefetchIntervalMs) {
      setPlaybackRefetchIntervalMs(nextInterval);
    }
  }, [
    playbackIsPlaying,
    playbackEnabled,
    playbackCursorMs,
    playbackWindowMs,
    playbackSessionId,
    playbackSampling,
    queryClient,
    playbackWindowParams,
    playbackRefetchIntervalMs
  ]);
  const { device: selectedDevice } = useDevice(deviceId);
  const deviceDetailQuery = useDeviceDetail(deviceId, { enabled: Boolean(deviceId) });
  const latestDeviceQuery = useDeviceLatest(deviceId ?? undefined);
  const autoSessionQuery = useAutoSession(deviceId, { enabled: Boolean(deviceId) });
  const deviceMarkerDevicesQuery = useDevices(false, { enabled: showDeviceMarkers });
  const markerCandidateDevices = useMemo(() => {
    const items = deviceMarkerDevicesQuery.data?.items ?? [];
    return items
      .filter((device) => Boolean(device.latestMeasurementAt))
      .sort((a, b) => getDeviceMarkerSortTimestamp(b) - getDeviceMarkerSortTimestamp(a))
      .slice(0, 200);
  }, [deviceMarkerDevicesQuery.data?.items]);
  const markerCandidateDeviceIds = useMemo(
    () => markerCandidateDevices.map((device) => device.id),
    [markerCandidateDevices]
  );
  const markerCandidateDeviceMap = useMemo(
    () => new Map(markerCandidateDevices.map((device) => [device.id, device])),
    [markerCandidateDevices]
  );
  const deviceMarkerDetailsQuery = useDevicesLatestLocations(markerCandidateDeviceIds, {
    enabled: showDeviceMarkers && markerCandidateDeviceIds.length > 0
  });
  const deviceLocationMarkers = useMemo(() => {
    if (!showDeviceMarkers) {
      return [];
    }

    return (deviceMarkerDetailsQuery.data ?? []).flatMap((detail) => {
      if (detail.id === deviceId) {
        return [];
      }
      const latestMeasurement = detail.latestMeasurement;
      if (
        !latestMeasurement ||
        !Number.isFinite(latestMeasurement.lat) ||
        !Number.isFinite(latestMeasurement.lon)
      ) {
        return [];
      }
      const summary = markerCandidateDeviceMap.get(detail.id);
      return [
        {
          deviceId: detail.id,
          deviceName: detail.name,
          deviceUid: detail.deviceUid,
          longName: detail.longName,
          shortName: detail.shortName,
          hwModel: detail.hwModel,
          role: detail.role,
          iconOverride: detail.iconOverride,
          iconKey: detail.iconKey,
          capturedAt: latestMeasurement.capturedAt,
          latestMeasurementAt:
            detail.latestMeasurementAt ?? summary?.latestMeasurementAt ?? latestMeasurement.capturedAt,
          latestWebhookReceivedAt:
            detail.latestWebhookReceivedAt ?? summary?.latestWebhookReceivedAt ?? null,
          latestWebhookSource: detail.latestWebhookSource ?? summary?.latestWebhookSource ?? null,
          lat: latestMeasurement.lat,
          lon: latestMeasurement.lon,
          rssi: latestMeasurement.rssi,
          snr: latestMeasurement.snr,
          gatewayId: latestMeasurement.gatewayId
        }
      ];
    });
  }, [
    showDeviceMarkers,
    deviceMarkerDetailsQuery.data,
    markerCandidateDeviceMap,
    deviceId
  ]);
  const latestMeasurementAt =
    latestDeviceQuery.data?.latestMeasurementAt ?? selectedDevice?.latestMeasurementAt ?? null;
  const showHomeGeofence = showHomeGeofenceOverride ?? (autoSessionQuery.data?.enabled === true);
  const handleShowHomeGeofenceChange = useCallback(
    (value: boolean) => {
      setShowHomeGeofenceOverride(value);
      if (typeof window === 'undefined' || !deviceId) {
        return;
      }
      window.localStorage.setItem(buildHomeGeofenceStorageKey(deviceId), value ? 'true' : 'false');
    },
    [deviceId]
  );
  const homeGeofenceConfig = useMemo(() => {
    const config = autoSessionQuery.data;
    if (!config) {
      return null;
    }
    const { homeLat, homeLon, radiusMeters } = config;
    const hasHomeLat = typeof homeLat === 'number' && Number.isFinite(homeLat);
    const hasHomeLon = typeof homeLon === 'number' && Number.isFinite(homeLon);
    const hasRadius = typeof radiusMeters === 'number' && Number.isFinite(radiusMeters);
    if (
      !hasHomeLat ||
      !hasHomeLon ||
      !hasRadius ||
      radiusMeters <= 0
    ) {
      return null;
    }
    return {
      lat: homeLat,
      lon: homeLon,
      radiusMeters
    };
  }, [
    autoSessionQuery.data?.homeLat,
    autoSessionQuery.data?.homeLon,
    autoSessionQuery.data?.radiusMeters
  ]);
  const isHomeGeofenceConfigured = homeGeofenceConfig !== null;
  const visibleHomeGeofenceOverlay =
    showHomeGeofence && homeGeofenceConfig ? homeGeofenceConfig : null;
  const selectedDeviceUid = selectedDevice?.deviceUid;
  const latestLocationMarker = useMemo(() => {
    if (!selectedDevice) {
      return null;
    }
    const latestMeasurement = deviceDetailQuery.data?.latestMeasurement;
    if (!latestMeasurement) {
      return null;
    }
    if (!Number.isFinite(latestMeasurement.lat) || !Number.isFinite(latestMeasurement.lon)) {
      return null;
    }
    return {
      deviceName: selectedDevice.name,
      deviceUid: selectedDevice.deviceUid,
      longName: selectedDevice.longName,
      hwModel: selectedDevice.hwModel,
      role: deviceDetailQuery.data?.role ?? null,
      shortName: deviceDetailQuery.data?.shortName ?? null,
      capturedAt: latestMeasurement.capturedAt,
      latestMeasurementAt: latestDeviceQuery.data?.latestMeasurementAt ?? latestMeasurement.capturedAt,
      latestWebhookReceivedAt: latestDeviceQuery.data?.latestWebhookReceivedAt ?? null,
      lat: latestMeasurement.lat,
      lon: latestMeasurement.lon,
      rssi: latestMeasurement.rssi,
      snr: latestMeasurement.snr,
      gatewayId: latestMeasurement.gatewayId
    };
  }, [
    selectedDevice,
    deviceDetailQuery.data?.latestMeasurement,
    deviceDetailQuery.data?.role,
    deviceDetailQuery.data?.shortName,
    latestDeviceQuery.data?.latestMeasurementAt,
    latestDeviceQuery.data?.latestWebhookReceivedAt
  ]);

  useEffect(() => {
    setReceiverSourceOverridden(false);
    setReceiverSource('lorawan');
    setSelectedReceiverId(null);
  }, [deviceId]);

  useEffect(() => {
    if (receiverSourceOverridden) {
      return;
    }
    const source = latestDeviceQuery.data?.latestWebhookSource;
    if (source === 'lorawan' || source === 'meshtastic') {
      setReceiverSource(source);
    }
  }, [latestDeviceQuery.data?.latestWebhookSource, receiverSourceOverridden]);
  const lorawanEventsQuery = useLorawanEvents(
    selectedDeviceUid,
    1,
    Boolean(selectedDeviceUid)
  );
  const selectedMeasurement = useMemo<Measurement | null>(() => {
    if (!selectedPointId) {
      return null;
    }
    if (isPlaybackMode) {
      const point = playbackWindowPoints.find((item) => item.id === selectedPointId);
      if (!point) {
        return null;
      }
      return {
        ...point,
        deviceId: playbackTimelineQuery.data?.deviceId ?? deviceId ?? '',
        sessionId: playbackSessionId ?? null,
        alt: null,
        altitude: null,
        pdop: null,
        satsInView: null,
        locationSource: null,
        precisionBits: null,
        groundSpeed: null,
        groundTrack: null,
        meshtasticRx: null
      };
    }
    return (activeMeasurements as Measurement[]).find((item) => item.id === selectedPointId) ?? null;
  }, [
    activeMeasurements,
    selectedPointId,
    isPlaybackMode,
    playbackWindowPoints,
    playbackTimelineQuery.data?.deviceId,
    deviceId,
    playbackSessionId
  ]);

  useEffect(() => {
    if (selectedPointId && !selectedMeasurement) {
      setSelectedPointId(null);
    }
  }, [selectedMeasurement, selectedPointId]);

  useEffect(() => {
    selectedSessionChangedAtRef.current = Date.now();
  }, [selectedSessionId]);

  useEffect(() => {
    playbackSessionChangedAtRef.current = Date.now();
  }, [playbackSessionId]);

  useEffect(() => {
    setHiddenComparisonSessionIds((current) => current.filter((id) => compareSessionIds.includes(id)));
  }, [compareSessionIds]);

  useEffect(() => {
    if (previousDeviceIdRef.current === deviceId) {
      return;
    }
    previousDeviceIdRef.current = deviceId;
    setSelectedSessionId(null);
    setCompareSelectionIds([]);
    setCompareSessionIds([]);
    setHiddenComparisonSessionIds([]);
    setPlaybackSessionId(null);
    setPlaybackIsPlaying(false);
    if (viewMode === 'playback') {
      setViewMode('explore');
    }
    if (filterMode === 'session') {
      setFilterMode('time');
    }
    setCoverageScope('device');
    setSelectedCoverageSessionId(null);
    previousFocusedCoverageSessionIdRef.current = null;
  }, [deviceId, filterMode, viewMode]);

  useEffect(() => {
    if (coverageScope !== 'session') {
      return;
    }
    if (coverageSessionOptions.length === 0) {
      if (selectedCoverageSessionId !== null) {
        setSelectedCoverageSessionId(null);
      }
      return;
    }
    if (
      selectedCoverageSessionId &&
      coverageSessionOptions.some((session) => session.id === selectedCoverageSessionId)
    ) {
      return;
    }
    setSelectedCoverageSessionId(coverageSessionOptions[0].id);
  }, [coverageScope, coverageSessionOptions, selectedCoverageSessionId]);

  useEffect(() => {
    const previousLayer = previousCoverageMapLayerRef.current;
    previousCoverageMapLayerRef.current = mapLayerMode;
    if (previousLayer === mapLayerMode || mapLayerMode !== 'coverage') {
      return;
    }
    if (focusedCoverageSessionId) {
      setCoverageScope('session');
      setSelectedCoverageSessionId(focusedCoverageSessionId);
      previousFocusedCoverageSessionIdRef.current = focusedCoverageSessionId;
      return;
    }
    setCoverageScope('device');
    setSelectedCoverageSessionId(null);
  }, [mapLayerMode, focusedCoverageSessionId]);

  useEffect(() => {
    if (previousFocusedCoverageSessionIdRef.current === focusedCoverageSessionId) {
      return;
    }
    previousFocusedCoverageSessionIdRef.current = focusedCoverageSessionId;
    if (mapLayerMode !== 'coverage') {
      return;
    }
    if (focusedCoverageSessionId) {
      setCoverageScope('session');
      setSelectedCoverageSessionId(focusedCoverageSessionId);
      return;
    }
    setCoverageScope('device');
    setSelectedCoverageSessionId(null);
  }, [focusedCoverageSessionId, mapLayerMode]);

  useEffect(() => {
    if (
      !deviceId ||
      !selectedSessionId ||
      !sessionPickerQuery.isFetched ||
      sessionPickerQuery.isFetching ||
      sessionPickerQuery.dataUpdatedAt < selectedSessionChangedAtRef.current
    ) {
      return;
    }
    if (nonArchivedSessionIds.has(selectedSessionId)) {
      return;
    }
    setSelectedSessionId(null);
    setSessionSelectionNotice('Selected session was archived or deleted, selection was cleared.');
  }, [
    deviceId,
    selectedSessionId,
    sessionPickerQuery.isFetched,
    sessionPickerQuery.isFetching,
    sessionPickerQuery.dataUpdatedAt,
    nonArchivedSessionIds
  ]);

  useEffect(() => {
    if (
      !deviceId ||
      !playbackSessionId ||
      !sessionPickerQuery.isFetched ||
      sessionPickerQuery.isFetching ||
      sessionPickerQuery.dataUpdatedAt < playbackSessionChangedAtRef.current
    ) {
      return;
    }
    if (nonArchivedSessionIds.has(playbackSessionId)) {
      return;
    }
    setPlaybackSessionId(null);
    setPlaybackIsPlaying(false);
      setSessionSelectionNotice('Playback session was archived or deleted, selection was cleared.');
  }, [
    deviceId,
    playbackSessionId,
    sessionPickerQuery.isFetched,
    sessionPickerQuery.isFetching,
    sessionPickerQuery.dataUpdatedAt,
    nonArchivedSessionIds
  ]);

  useEffect(() => {
    if (!deviceId || !sessionPickerQuery.isFetched || sessionPickerQuery.isFetching) {
      return;
    }

    const nextSelection = compareSelectionIds.filter((id) => nonArchivedSessionIds.has(id));
    if (!areStringListsEqual(compareSelectionIds, nextSelection)) {
      setCompareSelectionIds(nextSelection);
    }

    const nextCompareIds = compareSessionIds.filter((id) => nonArchivedSessionIds.has(id));
    if (areStringListsEqual(compareSessionIds, nextCompareIds)) {
      return;
    }

    setCompareSessionIds(nextCompareIds.length >= 2 ? nextCompareIds : []);
    setHiddenComparisonSessionIds((current) => current.filter((id) => nextCompareIds.includes(id)));

    if (compareSessionIds.length > 0) {
      setSessionSelectionNotice(
        nextCompareIds.length >= 2
          ? 'Compared session was archived or deleted, comparison was updated.'
          : 'Compared sessions changed, comparison was cleared.'
      );
    }
  }, [
    compareSelectionIds,
    compareSessionIds,
    deviceId,
    nonArchivedSessionIds,
    sessionPickerQuery.isFetched,
    sessionPickerQuery.isFetching
  ]);

  useEffect(() => {
    setUserInteractedWithMap(false);
    hasAutoFitRef.current = false;
    // Clear map bounds when the scope changes so the first fetch is not clipped to
    // the previous viewport (e.g. switching from SF to a Germany session).
    setBbox(null);
    setPointsBboxCommitted(null);
    setCoverageBinsBboxCommitted(null);
    setDebouncedBbox(null);
  }, [deviceId, selectedSessionId, compareSessionIdsKey]);

  useEffect(() => {
    if (mapLayerMode !== 'coverage') {
      return;
    }
    setUserInteractedWithMap(false);
    hasAutoFitRef.current = false;
    setBbox(null);
    setCoverageBinsBboxCommitted(null);
    setDebouncedBbox(null);
  }, [mapLayerMode, coverageScope, effectiveCoverageSessionId]);

  useEffect(() => {
    setSelectedGatewayId(null);
    setCompareGatewayId(null);
    setSelectedReceiverId(null);
    setCompareReceiverId(null);
  }, [deviceId, selectedSessionId, receiverSource]);

  const measurementBounds = useMemo(
    () => buildBoundsFromPoints(mapMeasurements.map((point) => [point.lat, point.lon] as LatLonPoint)),
    [mapMeasurements]
  );

  useEffect(() => {
    if (isCompareMode) {
      return;
    }
    if (!measurementBounds || !isValidLatLonBounds(measurementBounds)) {
      return;
    }
    if (activeMeasurementsQuery.isFetching) {
      return;
    }
    if (userInteractedWithMap) {
      return;
    }
    if (hasAutoFitRef.current) {
      return;
    }
    if (isDegenerateBounds(measurementBounds)) {
      mapRef.current?.focusPoint(measurementBounds[0], 16);
    } else {
      mapRef.current?.fitBounds(measurementBounds, { padding: [24, 24], maxZoom: 17 });
    }
    hasAutoFitRef.current = true;
  }, [isCompareMode, measurementBounds, userInteractedWithMap, activeMeasurementsQuery.isFetching]);

  useEffect(() => {
    if (!isCompareMode) {
      return;
    }
    if (comparisonLoading || userInteractedWithMap || hasAutoFitRef.current) {
      return;
    }
    const bounds = buildBoundsFromPoints(comparisonFitPoints);
    if (!bounds || !isValidLatLonBounds(bounds)) {
      return;
    }

    if (comparisonFitPoints.length < 2 || isDegenerateBounds(bounds)) {
      mapRef.current?.focusPoint(comparisonFitPoints[0], 16);
    } else {
      mapRef.current?.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
    }
    hasAutoFitRef.current = true;
  }, [comparisonFitPoints, comparisonLoading, isCompareMode, userInteractedWithMap]);

  const handleFitToData = () => {
    if (isCompareMode) {
      const bounds = buildBoundsFromPoints(comparisonFitPoints);
      if (comparisonFitPoints.length === 0 || !bounds) {
        setFitFeedback('No data to fit');
        return;
      }

      setFitFeedback(null);
      if (comparisonFitPoints.length < 2 || isDegenerateBounds(bounds)) {
        mapRef.current?.focusPoint(comparisonFitPoints[0], 16);
      } else {
        mapRef.current?.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
      }
      setUserInteractedWithMap(true);
      hasAutoFitRef.current = true;
      return;
    }

    const playbackPoints: LatLonPoint[] =
      viewMode === 'playback'
        ? playbackWindowPoints
            .map((point) => toLatLonPoint(point.lat, point.lon))
            .filter((point): point is LatLonPoint => point !== null)
        : [];

    const coverageTarget =
      mapLayerMode === 'coverage'
        ? buildCoverageFitTarget(coverageBins, coverageQuery.data?.binSizeDeg)
        : { points: [] as LatLonPoint[], bounds: null as LatLonBounds | null };

    const measurementPoints: LatLonPoint[] = [
      ...activeMeasurements
        .map((point) => toLatLonPoint(point.lat, point.lon))
        .filter((point): point is LatLonPoint => point !== null),
      ...activeCompareMeasurements
        .map((point) => toLatLonPoint(point.lat, point.lon))
        .filter((point): point is LatLonPoint => point !== null)
    ];
    const activeScopeTrackPoints: LatLonPoint[] = activeTrack
      .map((point) => toLatLonPoint(point.lat, point.lon))
      .filter((point): point is LatLonPoint => point !== null);
    const activeScopePoints =
      activeScopeTrackPoints.length > 0 ? activeScopeTrackPoints : measurementPoints;

    const target =
      playbackPoints.length > 0
        ? { points: playbackPoints, bounds: buildBoundsFromPoints(playbackPoints) }
        : mapLayerMode === 'coverage' && coverageTarget.points.length > 0
          ? coverageTarget
          : { points: activeScopePoints, bounds: buildBoundsFromPoints(activeScopePoints) };

    if (target.points.length === 0) {
      setFitFeedback('No data to fit');
      return;
    }

    setFitFeedback(null);
    if (target.points.length < 2 || !target.bounds) {
      mapRef.current?.focusPoint(target.points[0], 16);
    } else {
      mapRef.current?.fitBounds(target.bounds, { padding: [24, 24], maxZoom: 17 });
    }
    setUserInteractedWithMap(true);
    hasAutoFitRef.current = true;
  };

  const handleFitMapToSession = useCallback(
    async (
      sessionId: string,
      bbox: {
        minLat: number;
        minLon: number;
        maxLat: number;
        maxLon: number;
      } | null
    ) => {
      const bboxBounds: LatLonBounds | null = bbox
        ? (() => {
            const southWest = toLatLonPoint(bbox.minLat, bbox.minLon);
            const northEast = toLatLonPoint(bbox.maxLat, bbox.maxLon);
            if (!southWest || !northEast) {
              return null;
            }
            return [southWest, northEast];
          })()
        : null;

      if (bboxBounds && isValidLatLonBounds(bboxBounds)) {
        setFitFeedback(null);
        if (isDegenerateBounds(bboxBounds)) {
          mapRef.current?.focusPoint(bboxBounds[0], 16);
        } else {
          mapRef.current?.fitBounds(bboxBounds, { padding: [24, 24], maxZoom: 17 });
        }
        setUserInteractedWithMap(true);
        hasAutoFitRef.current = true;
        return;
      }

      try {
        const response = await getMeasurements(
          {
            sessionId,
            limit: 5000
          },
          {}
        );
        const points = response.items
          .map((point) => toLatLonPoint(point.lat, point.lon))
          .filter((point): point is LatLonPoint => point !== null);
        const bounds = buildBoundsFromPoints(points);
        if (points.length === 0) {
          setFitFeedback('No data to fit');
          return;
        }

        setFitFeedback(null);
        if (points.length < 2 || !bounds || isDegenerateBounds(bounds)) {
          mapRef.current?.focusPoint(points[0], 16);
        } else {
          mapRef.current?.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
        }
        setUserInteractedWithMap(true);
        hasAutoFitRef.current = true;
      } catch {
        setFitFeedback('No data to fit');
      }
    },
    []
  );

  const handleCenterOnLatestLocation = (point: [number, number]) => {
    mapRef.current?.focusPoint(point, 16);
    setFitFeedback(null);
    setUserInteractedWithMap(true);
    hasAutoFitRef.current = true;
  };

  useEffect(() => {
    if (!deviceId) {
      prevLatestMeasurementAt.current = null;
      return;
    }

    const latestMeasurementAt = latestDeviceQuery.data?.latestMeasurementAt ?? null;
    if (viewMode === 'playback') {
      prevLatestMeasurementAt.current = latestMeasurementAt;
      return;
    }
    if (!latestMeasurementAt) {
      prevLatestMeasurementAt.current = latestMeasurementAt;
      return;
    }

    const prev = prevLatestMeasurementAt.current;
    if (prev) {
      const latestTime = new Date(latestMeasurementAt).getTime();
      const prevTime = new Date(prev).getTime();
      if (Number.isFinite(latestTime) && Number.isFinite(prevTime) && latestTime > prevTime) {
        const bboxKey = bboxPayload
          ? `${bboxPayload.minLon},${bboxPayload.minLat},${bboxPayload.maxLon},${bboxPayload.maxLat}`
          : null;
        const normalizeTime = (value?: string | Date) =>
          value ? (value instanceof Date ? value.toISOString() : value) : null;
        const measurementsKey = {
          deviceId: effectiveExploreMeasurementsParams.deviceId ?? null,
          sessionId: effectiveExploreMeasurementsParams.sessionId ?? null,
          from: normalizeTime(effectiveExploreMeasurementsParams.from),
          to: normalizeTime(effectiveExploreMeasurementsParams.to),
          bbox: bboxKey,
          gatewayId: effectiveExploreMeasurementsParams.gatewayId ?? null,
          receiverId: effectiveExploreMeasurementsParams.receiverId ?? null,
          rxGatewayId: effectiveExploreMeasurementsParams.rxGatewayId ?? null,
          sample:
            typeof effectiveExploreMeasurementsParams.sample === 'number'
              ? effectiveExploreMeasurementsParams.sample
              : null,
          limit:
            typeof effectiveExploreMeasurementsParams.limit === 'number'
              ? effectiveExploreMeasurementsParams.limit
              : null,
          filterMode: exploreQueryFilterMode
        };
        const compareKey =
          compareId && (compareMeasurementsParams.rxGatewayId || compareMeasurementsParams.receiverId)
            ? {
                deviceId: compareMeasurementsParams.deviceId ?? null,
                sessionId: compareMeasurementsParams.sessionId ?? null,
                from: normalizeTime(compareMeasurementsParams.from),
                to: normalizeTime(compareMeasurementsParams.to),
                bbox: bboxKey,
                gatewayId: compareMeasurementsParams.gatewayId ?? null,
                receiverId: compareMeasurementsParams.receiverId ?? null,
                rxGatewayId: compareMeasurementsParams.rxGatewayId ?? null,
                sample:
                  typeof compareMeasurementsParams.sample === 'number'
                    ? compareMeasurementsParams.sample
                    : null,
                limit:
                  typeof compareMeasurementsParams.limit === 'number'
                    ? compareMeasurementsParams.limit
                    : null,
                filterMode
              }
            : null;
        const trackKey = {
          deviceId: effectiveExploreTrackParams.deviceId ?? null,
          sessionId: effectiveExploreTrackParams.sessionId ?? null,
          from: normalizeTime(effectiveExploreTrackParams.from),
          to: normalizeTime(effectiveExploreTrackParams.to),
          bbox: null,
          gatewayId: effectiveExploreTrackParams.gatewayId ?? null,
          receiverId: effectiveExploreTrackParams.receiverId ?? null,
          rxGatewayId: effectiveExploreTrackParams.rxGatewayId ?? null,
          sample:
            typeof effectiveExploreTrackParams.sample === 'number'
              ? effectiveExploreTrackParams.sample
              : null,
          limit:
            typeof effectiveExploreTrackParams.limit === 'number'
              ? effectiveExploreTrackParams.limit
              : null,
          filterMode: exploreQueryFilterMode
        };

        queryClient.invalidateQueries({ queryKey: ['measurements', measurementsKey] });
        if (compareKey) {
          queryClient.invalidateQueries({ queryKey: ['measurements', compareKey] });
        }
        queryClient.invalidateQueries({ queryKey: ['track', trackKey] });
      }
    }

    prevLatestMeasurementAt.current = latestMeasurementAt;
  }, [
    deviceId,
    latestDeviceQuery.data?.latestMeasurementAt,
    effectiveExploreMeasurementsParams,
    compareMeasurementsParams,
    compareId,
    effectiveExploreTrackParams,
    exploreQueryFilterMode,
    bboxPayload,
    filterMode,
    viewMode,
    queryClient
  ]);

  const isLoading = isCompareMode
    ? comparisonLoading
    : activeMeasurementsQuery.isLoading || Boolean(activeTrackQuery?.isLoading);
  const error = isCompareMode
    ? comparisonError
    : activeMeasurementsQuery.error ?? activeTrackQuery?.error;

  const latestEvent = lorawanEventsQuery.data?.items?.[0];
  const hasRecentLorawanEvent = (() => {
    if (!latestEvent?.receivedAt) {
      return false;
    }
    const eventTime = new Date(latestEvent.receivedAt).getTime();
    if (!Number.isFinite(eventTime)) {
      return false;
    }
    const windowMs = LORAWAN_DIAG_WINDOW_MINUTES * 60 * 1000;
    return Date.now() - eventTime <= windowMs;
  })();
  const isMissingGps = latestEvent?.processingError === 'missing_gps';
  const noMeasurementsReturned =
    activeMeasurementsQuery.data !== undefined && activeMeasurementsQuery.data.items.length === 0;
  const shouldShowLorawanBanner =
    Boolean(selectedDeviceUid) &&
    hasRecentLorawanEvent &&
    isMissingGps &&
    (latestMeasurementAt === null || noMeasurementsReturned);
  const statusDeviceLabel = selectedDevice
    ? buildDeviceIdentityLabel(selectedDevice)
    : 'No device';
  const statusSessionId = playbackSessionId ?? selectedSessionId;
  const isPointDetailsExpanded = tourForceRightPanelExpanded || (!zenMode && !pointDetailsCollapsed);
  const isStatsPanelExpanded = tourForceRightPanelExpanded || (!zenMode && !statsPanelCollapsed);
  const showRightPanel = !zenMode || tourForceRightPanelExpanded;
  const isRightPanelIconsOnly = showRightPanel && !isPointDetailsExpanded && !isStatsPanelExpanded;

  const sidebarHeader = (
    <div className="sidebar-header" aria-label="Sidebar header" data-tour="sidebar-header">
      <div className="sidebar-header__summary">
        <SelectedDeviceHeader
          device={selectedDevice}
          latestMeasurementAt={latestMeasurementAt}
          latestWebhookReceivedAt={latestDeviceQuery.data?.latestWebhookReceivedAt ?? null}
          latestWebhookSource={latestDeviceQuery.data?.latestWebhookSource ?? null}
          onFitToData={handleFitToData}
          fitFeedback={fitFeedback}
        />
      </div>
      <div className="sidebar-header__tabs-row" data-tour="sidebar-tabs">
        <div className="sidebar-header__tabs" role="tablist" aria-label="Sidebar tabs">
          {SIDEBAR_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-label={tab.label}
              aria-selected={sidebarTab === tab.key}
              className={`sidebar-header__tab${sidebarTab === tab.key ? ' is-active' : ''}`}
              onClick={() => setSidebarTab(tab.key)}
              data-tour={`sidebar-tab-${tab.key}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  const sidebarCollapsedRail = (
    <>
      {SIDEBAR_TABS.map((tab) => (
        <button
          key={`rail-${tab.key}`}
          type="button"
          title={tab.label}
          aria-label={tab.label}
          className={`layout__rail-icon${sidebarTab === tab.key ? ' is-active' : ''}`}
          onClick={() => setSidebarTab(tab.key)}
        >
          {tab.shortLabel}
        </button>
      ))}
    </>
  );

  const handleTourStart = useCallback(() => {
    setTourMenuOpen(false);
    setTourResetNotice(null);
    startTour();
  }, [startTour]);

  const handleTourReset = useCallback(() => {
    resetTour();
    setTourMenuOpen(true);
    setTourResetNotice('Tour reset. Start tour when ready.');
  }, [resetTour]);

  const sidebarFooter = (
    <div className="layout__sidebar-footer-brand">
      <div className="layout__sidebar-brand-logo-wrap" aria-hidden="true">
        <img
          src={logoDark}
          alt={`${APP_NAME} logo`}
          className="layout__sidebar-brand-logo layout__sidebar-brand-logo--dark"
        />
        <img
          src={logoLight}
          alt=""
          aria-hidden="true"
          className="layout__sidebar-brand-logo layout__sidebar-brand-logo--light"
        />
      </div>
      <span className="layout__sidebar-footer-meta">{`v${APP_VERSION}`}</span>
    </div>
  );
  const sidebarFooterCollapsed = (
    <div className="layout__sidebar-footer-mark">
      <div className="layout__sidebar-brand-mark-wrap" aria-hidden="true">
        <img
          src={markDark}
          alt={`${APP_NAME} icon`}
          className="layout__sidebar-brand-mark layout__sidebar-brand-mark--dark"
        />
        <img
          src={markLight}
          alt=""
          aria-hidden="true"
          className="layout__sidebar-brand-mark layout__sidebar-brand-mark--light"
        />
      </div>
    </div>
  );
  const zenToggleButton = (
    <button
      type="button"
      className={`layout__toggle-button${zenMode ? ' is-active' : ''}`}
      title={zenMode ? 'Disable zen mode (z)' : 'Enable zen mode (z)'}
      aria-label={zenMode ? 'Disable zen mode' : 'Enable zen mode'}
      onClick={() => setZenMode((value) => !value)}
      data-tour="zen-mode"
    >
      Z
    </button>
  );
  const tourToggleButton = (
    <div className="layout__tour-menu-wrap" ref={tourMenuRef}>
      <button
        type="button"
        className="layout__toggle-button"
        title="Help and tour"
        aria-label="Help and tour"
        aria-expanded={tourMenuOpen}
        aria-haspopup="menu"
        data-tour="tour-start-button"
        onClick={() => {
          setTourMenuOpen((value) => !value);
          setTourResetNotice(null);
        }}
      >
        ?
      </button>
      {tourMenuOpen ? (
        <div className="layout__tour-menu" role="menu" aria-label="Help menu">
          <button type="button" className="layout__tour-menu-item" role="menuitem" onClick={handleTourStart}>
            Start tour
          </button>
          <button type="button" className="layout__tour-menu-item" role="menuitem" onClick={handleTourReset}>
            Reset tour
          </button>
          <div
            className="layout__tour-menu-shortcuts"
            aria-label="Keyboard shortcuts"
            data-tour="shortcuts-help"
          >
            <span className="layout__tour-menu-shortcuts-title">Keyboard shortcuts</span>
            <div className="layout__tour-menu-shortcuts-row">
              <span className="layout__tour-menu-shortcuts-key">Z</span>
              <span className="layout__tour-menu-shortcuts-list">Zen mode toggle</span>
            </div>
            <div className="layout__tour-menu-shortcuts-row">
              <span className="layout__tour-menu-shortcuts-key">Esc</span>
              <span className="layout__tour-menu-shortcuts-list">Collapse sidebar</span>
            </div>
            <div className="layout__tour-menu-shortcuts-row">
              <span className="layout__tour-menu-shortcuts-key">Space / ← →</span>
              <span className="layout__tour-menu-shortcuts-list">Playback play and scrub</span>
            </div>
            <div className="layout__tour-menu-shortcuts-row">
              <span className="layout__tour-menu-shortcuts-key">Ctrl+B</span>
              <span className="layout__tour-menu-shortcuts-list">Sidebar toggle</span>
            </div>
          </div>
          {tourResetNotice ? <div className="layout__tour-menu-note">{tourResetNotice}</div> : null}
        </div>
      ) : null}
    </div>
  );
  const themeModeControl = (
    <select
      className="layout__sidebar-theme-select"
      aria-label="Theme mode"
      title="Theme mode"
      value={themeMode}
      onChange={(event) => setThemeMode(event.target.value as ThemeMode)}
    >
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  );

  const playbackControls = (
    <PlaybackPanel
      deviceId={deviceId}
      sessionId={playbackSessionId}
      onSelectSessionId={setPlaybackSessionId}
      timeline={playbackTimelineQuery.data ?? null}
      timelineLoading={playbackTimelineQuery.isLoading}
      timelineError={playbackTimelineQuery.error}
      windowFrom={playbackWindowSummary?.from ?? null}
      windowTo={playbackWindowSummary?.to ?? null}
      windowCount={playbackWindowSummary?.count ?? 0}
      windowItems={playbackWindowItems}
      sampleNote={playbackSampleNote}
      emptyNote={playbackEmptyNote}
      playbackCursorMs={playbackCursorMs}
      onPlaybackCursorMsChange={handlePlaybackCursorMsChange}
      playbackWindowMs={playbackWindowMs}
      onPlaybackWindowMsChange={setPlaybackWindowMs}
      playbackIsPlaying={playbackIsPlaying}
      onPlaybackIsPlayingChange={setPlaybackIsPlaying}
      playbackSpeed={playbackSpeed}
      onPlaybackSpeedChange={setPlaybackSpeed}
    />
  );

  const controlsPanel = (
    <Controls
      activeTab={sidebarTab}
      deviceId={deviceId}
      onDeviceChange={setDeviceId}
      filterMode={filterMode}
      onFilterModeChange={handleFilterModeChange}
      viewMode={viewMode}
      onViewModeChange={setViewMode}
      exploreRangePreset={exploreRangePreset}
      onExploreRangePresetChange={handleExploreRangePresetChange}
      useAdvancedRange={useAdvancedRange}
      onUseAdvancedRangeChange={handleUseAdvancedRangeChange}
      selectedSessionId={selectedSessionId}
      playbackSessionId={playbackSessionId}
      onSelectSessionId={setSelectedSessionId}
      onStartSession={handleSessionStart}
      receiverSource={receiverSource}
      onReceiverSourceChange={handleReceiverSourceChange}
      selectedReceiverId={selectedReceiverId}
      onSelectReceiverId={setSelectedReceiverId}
      compareReceiverId={compareReceiverId}
      onSelectCompareReceiverId={setCompareReceiverId}
      selectedGatewayId={selectedGatewayId}
      onSelectGatewayId={setSelectedGatewayId}
      compareGatewayId={compareGatewayId}
      onSelectCompareGatewayId={setCompareGatewayId}
      latest={latestDeviceQuery.data}
      onFitToData={handleFitToData}
      onFitMapToSession={handleFitMapToSession}
      onCenterOnLatestLocation={handleCenterOnLatestLocation}
      mapLayerMode={mapLayerMode}
      onMapLayerModeChange={setMapLayerMode}
      coverageVisualizationMode={coverageVisualizationMode}
      onCoverageVisualizationModeChange={setCoverageVisualizationMode}
      coverageScope={coverageScope}
      onCoverageScopeChange={setCoverageScope}
      selectedCoverageSessionId={selectedCoverageSessionId}
      onSelectedCoverageSessionIdChange={setSelectedCoverageSessionId}
      coverageSessionOptions={coverageSessionOptions}
      coverageMetric={coverageMetric}
      onCoverageMetricChange={setCoverageMetric}
      rangeFrom={exploreRange.from}
      rangeTo={exploreRange.to}
      from={from}
      to={to}
      onFromChange={setFrom}
      onToChange={setTo}
      showPoints={showPoints}
      showTrack={showTrack}
      showCoverageTracks={showCoverageTracks}
      showDeviceMarkers={showDeviceMarkers}
      onShowDeviceMarkersChange={setShowDeviceMarkers}
      showHomeGeofence={showHomeGeofence}
      homeGeofenceConfigured={isHomeGeofenceConfigured}
      onShowHomeGeofenceChange={handleShowHomeGeofenceChange}
      onShowPointsChange={setShowPoints}
      onShowTrackChange={setShowTrack}
      onShowCoverageTracksChange={setShowCoverageTracks}
      playbackControls={playbackControls}
      fitFeedback={fitFeedback}
      sessionSelectionNotice={sessionSelectionNotice}
      comparisonActive={isCompareMode}
      comparisonSelectionIds={compareSelectionIds}
      comparisonSelectionDirty={comparisonSelectionDirty}
      comparisonItems={comparisonItems}
      onToggleCompareSelection={handleToggleCompareSelection}
      onStartComparison={handleStartComparison}
      onClearCompareSelection={handleClearCompareSelection}
      onExitComparison={handleExitComparison}
      onToggleComparedSessionVisibility={handleToggleComparedSessionVisibility}
      onFitComparedSessions={handleFitToData}
      eventsNavigationNonce={eventsNavigationNonce}
      eventsNavigationRequest={eventsNavigationRequest}
      onOpenEvents={handleOpenEvents}
      onSelectEventForMap={handleSelectEventForMap}
    />
  );

  return (
    <div className="app">
      <Layout
        sidebarHeader={sidebarHeader}
        sidebarFooter={sidebarFooter}
        sidebarFooterCollapsed={sidebarFooterCollapsed}
        sidebarHeaderActions={
          <>
            {tourToggleButton}
            {zenToggleButton}
          </>
        }
        sidebarHeaderBottomActions={themeModeControl}
        sidebarCollapsedContent={zenMode ? null : sidebarCollapsedRail}
        sidebar={controlsPanel}
        forceSidebarCollapsed={zenMode && !isTourActive}
        forceSidebarExpanded={isTourActive}
      >
        <MapView
          ref={mapRef}
          theme={effectiveTheme}
          mapLayerMode={effectiveMapLayerMode}
          coverageScope={coverageScope}
          coverageVisualizationMode={coverageVisualizationMode}
          coverageMetric={coverageMetric}
          measurements={isCompareMode ? [] : mapMeasurements}
          compareMeasurements={isCompareMode ? [] : mapCompareMeasurements}
          comparisonTracks={isCompareMode ? comparisonTracks : []}
          comparisonHighlights={isCompareMode ? comparisonHighlights : []}
          track={isCompareMode ? [] : mapTrackPoints}
          overviewTrack={isPlaybackMode ? mapOverviewTrack : []}
          coverageBins={coverageBins}
          coverageBinSize={coverageQuery.data?.binSizeDeg ?? null}
          showPoints={showPoints}
          showTrack={showTrack}
          showCoverageTracks={showCoverageTracks}
          interactionEnabled={!isTourActive}
          playbackCursorPosition={safePlaybackCursorPosition}
          latestLocationMarker={latestLocationMarker}
          showLatestLocationMarker={!isPlaybackMode}
          deviceLocationMarkers={!isPlaybackMode && showDeviceMarkers ? deviceLocationMarkers : []}
          homeGeofenceOverlay={visibleHomeGeofenceOverlay}
          onSelectDeviceMarker={setDeviceId}
          onBoundsChange={handleBoundsChange}
          onSelectPoint={setSelectedPointId}
          onOverviewSelectTime={isPlaybackMode ? handlePlaybackCursorMsChange : undefined}
          onZoomChange={setCurrentZoom}
          selectedPointId={selectedPointId}
          onUserInteraction={() => setUserInteractedWithMap(true)}
        />
        {isCompareMode && comparisonItems.length > 0 ? (
          <div className="comparison-legend" role="region" aria-label="Compared sessions legend">
            <div className="comparison-legend__header">
              <span>Session comparison</span>
              <strong>{comparisonItems.filter((item) => item.isVisible).length} visible</strong>
            </div>
            <div className="comparison-legend__list">
              {comparisonItems.map((item) => (
                <div
                  key={item.id}
                  className={`comparison-legend__item${item.isVisible ? '' : ' is-muted'}`}
                >
                  <span
                    className="comparison-legend__swatch"
                    style={{ backgroundColor: item.style.color }}
                    aria-hidden="true"
                  />
                  <div className="comparison-legend__copy">
                    <span className="comparison-legend__label" title={item.label}>
                      {item.label}
                    </span>
                    <span className="comparison-legend__meta">
                      Max range {formatDistanceMeters(item.farthestPoint?.distanceMeters ?? null)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {!zenMode && viewMode === 'playback' && !playbackSessionId && (
          <div className="playback-blocker" role="alert">
            <div className="playback-blocker__message">Select a session</div>
          </div>
        )}
        {import.meta.env.DEV && !zenMode && (
          <div className="dev-counter">
            {effectiveMapLayerMode === 'coverage'
              ? `Coverage bins: ${renderedBinCount}`
              : `Points: ${renderedPointCount}`}
          </div>
        )}
        {!zenMode &&
          !isCompareMode &&
          activeMeasurementsQuery.data &&
          activeMeasurementsQuery.data.items.length === activeMeasurementsQuery.data.limit && (
            <div className="limit-banner">Result limited; zoom in or narrow filters</div>
          )}
        {!zenMode && !isCompareMode && shouldShowLorawanBanner && (
          <div className="diagnostic-banner">
            LoRaWAN uplinks received, but decoded payload has no lat/lon. Configure payload formatter
            to output GPS.{' '}
            <a href="../docs/tts-payload-formatter-js.md" target="_blank" rel="noreferrer">
              docs/tts-payload-formatter-js.md
            </a>
          </div>
        )}
        <StatusStrip
          device={selectedDevice ?? null}
          deviceLabel={statusDeviceLabel}
          latestMeasurementAt={latestMeasurementAt}
          latestWebhookSource={latestDeviceQuery.data?.latestWebhookSource ?? null}
          latestWebhookReceivedAt={latestDeviceQuery.data?.latestWebhookReceivedAt ?? null}
          activeSessionId={statusSessionId}
          formatRelativeTime={formatRelativeTime}
          showThemeSwitcher={zenMode}
          themeMode={themeMode}
          onThemeModeChange={setThemeMode}
        />
        {showRightPanel ? (
          <div
            className={`right-column${isRightPanelIconsOnly ? ' right-column--icons-only' : ''}`}
            data-tour="right-panel"
          >
            <div
              className={`right-panel-slot ${
                isPointDetailsExpanded ? 'right-panel-slot--point-details' : 'right-panel-slot--collapsed'
              }`}
            >
              {isPointDetailsExpanded ? (
                <>
                  <button
                    type="button"
                    className="right-panel-slot__toggle"
                    onClick={() => setPointDetailsCollapsed(true)}
                    aria-label="Collapse point details panel"
                    title="Collapse point details panel"
                    disabled={tourForceRightPanelExpanded}
                  >
                    <IconChevronRight size={14} aria-hidden="true" />
                  </button>
                  <PointDetails
                    measurement={selectedMeasurement}
                    deviceUid={selectedMeasurement?.deviceUid ?? selectedDeviceUid ?? null}
                    onOpenEvents={handleOpenEvents}
                  />
                </>
              ) : (
                <button
                  type="button"
                  className="right-panel-toggle"
                  onClick={() => setPointDetailsCollapsed(false)}
                  aria-label="Show point details panel"
                  title="Show point details panel"
                  disabled={tourForceRightPanelExpanded}
                >
                  <IconFileSearch size={16} aria-hidden="true" />
                </button>
              )}
            </div>
            <div
              className={`right-panel-slot ${
                isStatsPanelExpanded ? 'right-panel-slot--stats' : 'right-panel-slot--collapsed'
              }`}
            >
              {isStatsPanelExpanded ? (
                <>
                  <button
                    type="button"
                    className="right-panel-slot__toggle"
                    onClick={() => setStatsPanelCollapsed(true)}
                    aria-label="Collapse stats panel"
                    title="Collapse stats panel"
                    disabled={tourForceRightPanelExpanded}
                  >
                    <IconChevronRight size={14} aria-hidden="true" />
                  </button>
                  <StatsCard
                    stats={statsQuery.data}
                    isLoading={statsQuery.isLoading}
                    error={statsQuery.error as Error | null}
                  />
                </>
              ) : (
                <button
                  type="button"
                  className="right-panel-toggle"
                  onClick={() => setStatsPanelCollapsed(false)}
                  aria-label="Show stats panel"
                  title="Show stats panel"
                  disabled={tourForceRightPanelExpanded}
                >
                  <IconChartBar size={16} aria-hidden="true" />
                </button>
              )}
            </div>
          </div>
        ) : null}
        {!zenMode && (isLoading || error) && (
          <div className="status">
            {isLoading && <p>Loading map data…</p>}
            {error && (
              <p className="status__error">
                {(error as Error).message || 'Failed to load map data.'}
              </p>
            )}
          </div>
        )}
      </Layout>
    </div>
  );
}

export default App;
