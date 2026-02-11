import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQueryClient } from '@tanstack/react-query';
import { getSessionWindow, type CoverageQueryParams, type MeasurementQueryParams } from './api/endpoints';
import type { Measurement, SessionWindowPoint } from './api/types';
import Controls from './components/Controls';
import Layout from './components/Layout';
import MapView, { type MapViewHandle } from './components/MapView';
import PlaybackPanel from './components/PlaybackPanel';
import PointDetails from './components/PointDetails';
import SelectedDeviceHeader from './components/SelectedDeviceHeader';
import StatsCard from './components/StatsCard';
import {
  useCoverageBins,
  useDevice,
  useDeviceLatest,
  useMeasurements,
  useStats,
  useTrack
} from './query/hooks';
import { useLorawanEvents } from './query/lorawan';
import { useSessionTimeline, useSessionWindow } from './query/sessions';
import './App.css';

const DEFAULT_LIMIT = 2000;
const LOW_ZOOM_LIMIT = 1000;
const LIMIT_ZOOM_THRESHOLD = 12;
const BBOX_DEBOUNCE_MS = 300;
const SAMPLE_ZOOM_LOW = 12;
const SAMPLE_ZOOM_MEDIUM = 14;
const LORAWAN_DIAG_WINDOW_MINUTES = 10;
const SIDEBAR_TAB_KEY = 'sidebarTab';
const ZEN_MODE_KEY = 'zenMode';

type SidebarTab = 'device' | 'sessions' | 'playback' | 'coverage' | 'debug';

type InitialQueryState = {
  deviceId: string | null;
  filterMode: 'time' | 'session';
  sessionId: string | null;
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

function readInitialQueryState(): InitialQueryState {
  if (typeof window === 'undefined') {
    return {
      deviceId: null,
      filterMode: 'time',
      sessionId: null,
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
  const initial = useMemo(() => readInitialQueryState(), []);

  const queryClient = useQueryClient();
  const prevLatestMeasurementAt = useRef<string | null>(null);
  const mapRef = useRef<MapViewHandle | null>(null);
  const hasAutoFitRef = useRef(false);
  const playbackStartRef = useRef<number | null>(null);
  const playbackStartCursorRef = useRef(0);
  const playbackStepRef = useRef(0);
  const playbackCursorRef = useRef(0);

  const [deviceId, setDeviceId] = useState<string | null>(initial.deviceId);
  const [filterMode, setFilterMode] = useState<'time' | 'session'>(initial.filterMode);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initial.sessionId);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [exploreRangePreset, setExploreRangePreset] = useState<ExploreRangePreset>(
    initial.exploreRangePreset
  );
  const [useAdvancedRange, setUseAdvancedRange] = useState(initial.useAdvancedRange);
  const [presetAnchorMs, setPresetAnchorMs] = useState(Date.now());
  const [bbox, setBbox] = useState<[number, number, number, number] | null>(null);
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
  const [coverageMetric, setCoverageMetric] = useState<'count' | 'rssiAvg' | 'snrAvg'>('count');
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>(() => readInitialSidebarTab());
  const [zenMode, setZenMode] = useState<boolean>(() => readStoredZenMode());
  const [showPoints, setShowPoints] = useState(initial.showPoints);
  const [showTrack, setShowTrack] = useState(initial.showTrack);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [receiverSource, setReceiverSource] = useState<'lorawan' | 'meshtastic'>('lorawan');
  const [receiverSourceOverridden, setReceiverSourceOverridden] = useState(false);
  const [selectedReceiverId, setSelectedReceiverId] = useState<string | null>(null);
  const [compareReceiverId, setCompareReceiverId] = useState<string | null>(null);
  const [selectedGatewayId, setSelectedGatewayId] = useState<string | null>(null);
  const [compareGatewayId, setCompareGatewayId] = useState<string | null>(null);
  const [userInteractedWithMap, setUserInteractedWithMap] = useState(false);

  useEffect(() => {
    playbackCursorRef.current = playbackCursorMs;
  }, [playbackCursorMs]);

  useEffect(() => {
    setPresetAnchorMs(Date.now());
  }, [exploreRangePreset]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedBbox(bbox);
    }, BBOX_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [bbox]);

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

    const params = new URLSearchParams();
    if (deviceId) {
      params.set('deviceId', deviceId);
    }
    params.set('filterMode', filterMode);
    if (selectedSessionId) {
      params.set('sessionId', selectedSessionId);
    }
    params.set('rangePreset', exploreRangePreset);
    if (useAdvancedRange) {
      params.set('rangeAdvanced', 'true');
      if (from) {
        params.set('from', from);
      }
      if (to) {
        params.set('to', to);
      }
    }
    if (!showPoints) {
      params.set('showPoints', 'false');
    }
    if (!showTrack) {
      params.set('showTrack', 'false');
    }
    params.set('viewMode', viewMode);
    if (playbackSessionId) {
      params.set('playbackSessionId', playbackSessionId);
    }
    if (Number.isFinite(playbackCursorMs)) {
      params.set('playbackCursor', new Date(playbackCursorMs).toISOString());
    }
    if (Number.isFinite(playbackWindowMs)) {
      params.set('playbackWindowMinutes', String(Math.round(playbackWindowMs / 60000)));
    }
    params.set('playbackSpeed', String(playbackSpeed));

    const search = params.toString();
    const nextUrl = `${window.location.pathname}${search ? `?${search}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', nextUrl);
  }, [
    deviceId,
    filterMode,
    selectedSessionId,
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
    playbackSpeed
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

  const isSessionMode = filterMode === 'session' && Boolean(selectedSessionId);
  const isPlaybackMode = viewMode === 'playback';
  const hasPlaybackSession = Boolean(playbackSessionId);
  const isMeshtasticSource = receiverSource === 'meshtastic';

  const playbackTimelineQuery = useSessionTimeline(playbackSessionId ?? undefined, {
    enabled: Boolean(playbackSessionId)
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

  const exploreMeasurementsParams = useMemo<MeasurementQueryParams>(() => {
    const receiverId = isMeshtasticSource ? selectedReceiverId ?? undefined : undefined;
    const rxGatewayId = !isMeshtasticSource ? selectedGatewayId ?? undefined : undefined;
    if (isSessionMode) {
      return {
        sessionId: selectedSessionId ?? undefined,
        bbox: bboxPayload,
        receiverId,
        rxGatewayId,
        sample: effectiveSample,
        limit: effectiveLimit
      };
    }
    return {
      deviceId: deviceId ?? undefined,
      from: exploreRange.from,
      to: exploreRange.to,
      bbox: bboxPayload,
      receiverId,
      rxGatewayId,
      sample: effectiveSample,
      limit: effectiveLimit
    };
  }, [
    isSessionMode,
    selectedSessionId,
    bboxPayload,
    deviceId,
    exploreRange.from,
    exploreRange.to,
    selectedGatewayId,
    selectedReceiverId,
    isMeshtasticSource,
    effectiveSample,
    effectiveLimit
  ]);

  const exploreTrackParams = useMemo<MeasurementQueryParams>(() => {
    const receiverId = isMeshtasticSource ? selectedReceiverId ?? undefined : undefined;
    const rxGatewayId = !isMeshtasticSource ? selectedGatewayId ?? undefined : undefined;
    if (isSessionMode) {
      return {
        sessionId: selectedSessionId ?? undefined,
        receiverId,
        rxGatewayId,
        sample: effectiveSample,
        limit: effectiveLimit
      };
    }
    return {
      deviceId: deviceId ?? undefined,
      from: exploreRange.from,
      to: exploreRange.to,
      receiverId,
      rxGatewayId,
      sample: effectiveSample,
      limit: effectiveLimit
    };
  }, [
    isSessionMode,
    selectedSessionId,
    deviceId,
    exploreRange.from,
    exploreRange.to,
    selectedGatewayId,
    selectedReceiverId,
    isMeshtasticSource,
    effectiveSample,
    effectiveLimit
  ]);

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

  const exploreEnabled = viewMode !== 'playback';
  const playbackEnabled = isPlaybackMode && hasPlaybackSession;
  const sessionPolling = exploreEnabled && isSessionMode ? 2000 : false;

  const exploreMeasurementsQuery = useMeasurements(
    exploreMeasurementsParams,
    {
      enabled: exploreEnabled && (isSessionMode ? Boolean(selectedSessionId) : Boolean(deviceId))
    },
    { filterMode, refetchIntervalMs: sessionPolling }
  );
  const exploreTrackQuery = useTrack(
    exploreTrackParams,
    {
      enabled: exploreEnabled && (isSessionMode ? Boolean(selectedSessionId) : Boolean(deviceId))
    },
    { filterMode, refetchIntervalMs: sessionPolling }
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
        bbox: bboxPayload,
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
      bbox: bboxPayload,
      receiverId,
      rxGatewayId,
      sample: compareSample,
      limit: effectiveLimit
    };
  }, [
    isSessionMode,
    selectedSessionId,
    bboxPayload,
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
        (isSessionMode ? Boolean(selectedSessionId) : Boolean(deviceId))
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
  const activeMeasurementsQuery = isPlaybackMode
    ? playbackWindowQuery
    : exploreMeasurementsQuery;
  const activeTrackQuery = isPlaybackMode ? null : exploreTrackQuery;
  const effectiveMapLayerMode = isPlaybackMode ? 'points' : mapLayerMode;
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
  const coverageParams = useMemo<CoverageQueryParams>(() => {
    const gatewayId = receiverSource === 'lorawan' ? selectedGatewayId ?? undefined : undefined;
    if (isSessionMode) {
      return {
        sessionId: selectedSessionId ?? undefined,
        bbox: debouncedBbox ?? undefined,
        gatewayId
      };
    }
    return {
      deviceId: deviceId ?? undefined,
      bbox: debouncedBbox ?? undefined,
      gatewayId
    };
  }, [isSessionMode, selectedSessionId, debouncedBbox, deviceId, selectedGatewayId, receiverSource]);
  const coverageQuery = useCoverageBins(
    coverageParams,
    {
      enabled:
        !isPlaybackMode &&
        mapLayerMode === 'coverage' &&
        Boolean(bboxPayload) &&
        (isSessionMode ? Boolean(selectedSessionId) : Boolean(deviceId))
    },
    { filterMode }
  );
  const renderedPointCount =
    effectiveMapLayerMode === 'points'
      ? (showPoints ? activeMeasurements.length : 0) + activeCompareMeasurements.length
      : 0;
  const renderedBinCount =
    effectiveMapLayerMode === 'coverage' ? coverageQuery.data?.items.length ?? 0 : 0;

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
  const latestDeviceQuery = useDeviceLatest(deviceId ?? undefined);
  const latestMeasurementAt =
    latestDeviceQuery.data?.latestMeasurementAt ?? selectedDevice?.latestMeasurementAt ?? null;
  const selectedDeviceUid = selectedDevice?.deviceUid;

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
        alt: null
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
    setSelectedSessionId(null);
  }, [deviceId]);

  useEffect(() => {
    setUserInteractedWithMap(false);
    hasAutoFitRef.current = false;
  }, [deviceId, selectedSessionId]);

  useEffect(() => {
    setSelectedGatewayId(null);
    setCompareGatewayId(null);
    setSelectedReceiverId(null);
    setCompareReceiverId(null);
  }, [deviceId, selectedSessionId, receiverSource]);

  const measurementBounds = useMemo(() => {
    const items = activeMeasurements;
    if (items.length === 0) {
      return null;
    }
    let minLat = items[0].lat;
    let maxLat = items[0].lat;
    let minLon = items[0].lon;
    let maxLon = items[0].lon;

    for (const item of items) {
      if (item.lat < minLat) minLat = item.lat;
      if (item.lat > maxLat) maxLat = item.lat;
      if (item.lon < minLon) minLon = item.lon;
      if (item.lon > maxLon) maxLon = item.lon;
    }

    return [
      [minLat, minLon],
      [maxLat, maxLon]
    ] as [[number, number], [number, number]];
  }, [activeMeasurements]);

  useEffect(() => {
    if (!measurementBounds) {
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
    mapRef.current?.fitBounds(measurementBounds);
    hasAutoFitRef.current = true;
  }, [measurementBounds, userInteractedWithMap, activeMeasurementsQuery.isFetching]);

  const handleFitToData = () => {
    if (!measurementBounds) {
      return;
    }
    mapRef.current?.fitBounds(measurementBounds);
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
          deviceId: exploreMeasurementsParams.deviceId ?? null,
          sessionId: exploreMeasurementsParams.sessionId ?? null,
          from: normalizeTime(exploreMeasurementsParams.from),
          to: normalizeTime(exploreMeasurementsParams.to),
          bbox: bboxKey,
          gatewayId: exploreMeasurementsParams.gatewayId ?? null,
          receiverId: exploreMeasurementsParams.receiverId ?? null,
          rxGatewayId: exploreMeasurementsParams.rxGatewayId ?? null,
          sample:
            typeof exploreMeasurementsParams.sample === 'number'
              ? exploreMeasurementsParams.sample
              : null,
          limit:
            typeof exploreMeasurementsParams.limit === 'number'
              ? exploreMeasurementsParams.limit
              : null,
          filterMode
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
          deviceId: exploreTrackParams.deviceId ?? null,
          sessionId: exploreTrackParams.sessionId ?? null,
          from: normalizeTime(exploreTrackParams.from),
          to: normalizeTime(exploreTrackParams.to),
          bbox: null,
          gatewayId: exploreTrackParams.gatewayId ?? null,
          receiverId: exploreTrackParams.receiverId ?? null,
          rxGatewayId: exploreTrackParams.rxGatewayId ?? null,
          sample:
            typeof exploreTrackParams.sample === 'number' ? exploreTrackParams.sample : null,
          limit: typeof exploreTrackParams.limit === 'number' ? exploreTrackParams.limit : null,
          filterMode
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
    exploreMeasurementsParams,
    compareMeasurementsParams,
    compareId,
    exploreTrackParams,
    bboxPayload,
    filterMode,
    viewMode,
    queryClient
  ]);

  const isLoading = activeMeasurementsQuery.isLoading || Boolean(activeTrackQuery?.isLoading);
  const error = activeMeasurementsQuery.error ?? activeTrackQuery?.error;

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
  const zenStatusDevice = selectedDevice
    ? formatDeviceLabel(selectedDevice.name, selectedDevice.deviceUid)
    : 'No device';
  const zenStatusCount =
    effectiveMapLayerMode === 'coverage'
      ? `Bins ${renderedBinCount}`
      : `Points ${renderedPointCount}`;
  const zenStatusError = error ? (error as Error).message || 'Failed to load data' : null;

  const sidebarHeader = (
    <div className="sidebar-header" aria-label="Sidebar header">
      <SelectedDeviceHeader device={selectedDevice} onFitToData={handleFitToData} />
      <div className="sidebar-header__tabs" role="tablist" aria-label="Sidebar tabs">
        {SIDEBAR_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={sidebarTab === tab.key}
            className={`sidebar-header__tab${sidebarTab === tab.key ? ' is-active' : ''}`}
            onClick={() => setSidebarTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
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

  const sidebarFooter = <span className="layout__sidebar-footer-meta">{sidebarTab}</span>;
  const zenToggleButton = (
    <button
      type="button"
      className={`layout__toggle-button${zenMode ? ' is-active' : ''}`}
      title={zenMode ? 'Disable zen mode (z)' : 'Enable zen mode (z)'}
      aria-label={zenMode ? 'Disable zen mode' : 'Enable zen mode'}
      onClick={() => setZenMode((value) => !value)}
    >
      Z
    </button>
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
      mapLayerMode={mapLayerMode}
      onMapLayerModeChange={setMapLayerMode}
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
      onShowPointsChange={setShowPoints}
      onShowTrackChange={setShowTrack}
      playbackControls={playbackControls}
    />
  );

  return (
    <div className="app">
      <Layout
        sidebarHeader={sidebarHeader}
        sidebarFooter={sidebarFooter}
        sidebarHeaderActions={zenToggleButton}
        sidebarCollapsedContent={zenMode ? null : sidebarCollapsedRail}
        sidebar={controlsPanel}
        forceSidebarCollapsed={zenMode}
      >
        <MapView
          ref={mapRef}
          mapLayerMode={effectiveMapLayerMode}
          coverageMetric={coverageMetric}
          measurements={activeMeasurements}
          compareMeasurements={activeCompareMeasurements}
          track={activeTrack}
          overviewTrack={isPlaybackMode ? playbackOverviewTrack : []}
          coverageBins={coverageQuery.data?.items ?? []}
          coverageBinSize={coverageQuery.data?.binSizeDeg ?? null}
          showPoints={showPoints}
          showTrack={showTrack}
          playbackCursorPosition={playbackCursorPosition}
          onBoundsChange={setBbox}
          onSelectPoint={setSelectedPointId}
          onOverviewSelectTime={isPlaybackMode ? handlePlaybackCursorMsChange : undefined}
          onZoomChange={setCurrentZoom}
          selectedPointId={selectedPointId}
          onUserInteraction={() => setUserInteractedWithMap(true)}
        />
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
          activeMeasurementsQuery.data &&
          activeMeasurementsQuery.data.items.length === activeMeasurementsQuery.data.limit && (
            <div className="limit-banner">Result limited; zoom in or narrow filters</div>
          )}
        {!zenMode && shouldShowLorawanBanner && (
          <div className="diagnostic-banner">
            LoRaWAN uplinks received, but decoded payload has no lat/lon. Configure payload formatter
            to output GPS.{' '}
            <a href="../docs/tts-payload-formatter-js.md" target="_blank" rel="noreferrer">
              docs/tts-payload-formatter-js.md
            </a>
          </div>
        )}
        {!zenMode && (
          <div className="right-column">
            <PointDetails measurement={selectedMeasurement} />
            <StatsCard
              stats={statsQuery.data}
              isLoading={statsQuery.isLoading}
              error={statsQuery.error as Error | null}
            />
          </div>
        )}
        {zenMode && (
          <div className="zen-status-strip" aria-live="polite">
            <span>{zenStatusDevice}</span>
            <span>{viewMode === 'playback' ? 'Playback' : 'Explore'}</span>
            <span>{effectiveMapLayerMode === 'coverage' ? 'Coverage' : 'Points'}</span>
            <span>{zenStatusCount}</span>
            {latestMeasurementAt ? <span>Last {formatRelativeTime(latestMeasurementAt)}</span> : null}
            {viewMode === 'playback' && !playbackSessionId ? <span>Select a session</span> : null}
            {isLoading ? <span>Loading…</span> : null}
            {zenStatusError ? <span className="zen-status-strip__error">{zenStatusError}</span> : null}
          </div>
        )}
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
