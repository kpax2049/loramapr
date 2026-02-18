import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { StatsResponse } from '../api/endpoints';
import type {
  AutoSessionConfig,
  Device,
  Measurement,
  Session,
  SessionDetail,
  SessionTimeline,
  SessionWindowPoint
} from '../api/types';
import Controls from '../components/Controls';
import Layout from '../components/Layout';
import MapView from '../components/MapView';
import PlaybackPanel from '../components/PlaybackPanel';
import PointDetails from '../components/PointDetails';
import SelectedDeviceHeader from '../components/SelectedDeviceHeader';
import SessionsPanel from '../components/SessionsPanel';
import StatsCard from '../components/StatsCard';
import StatusStrip from '../components/StatusStrip';
import '../App.css';
import './UiKit.css';

type UiKitTheme =
  | 'default'
  | 'yellow-black-sat'
  | 'space-map'
  | 'retro-future-gadget'
  | 'white-grid-industrial'
  | 'white-cyber-hud'
  | 'mono-tech-frame'
  | 'lrm-mono-dark'
  | 'lrm-mono-light';

const DEMO_DEVICE_ID = 'ui-kit-device-1';
const DEMO_SESSION_ACTIVE_ID = 'ui-kit-session-active';
const DEMO_SESSION_ARCHIVED_ID = 'ui-kit-session-archived';

const DEMO_DEVICE: Device = {
  id: DEMO_DEVICE_ID,
  deviceUid: 'dev-uikit-001',
  name: 'UiKit Device',
  longName: 'UI Kit Field Mapper',
  hwModel: 'T-Beam',
  iconKey: 'auto',
  iconOverride: false,
  notes: 'Preview-only demo device',
  isArchived: false,
  lastSeenAt: '2026-02-09T09:45:00.000Z',
  latestMeasurementAt: '2026-02-09T09:45:00.000Z',
  latestWebhookReceivedAt: '2026-02-09T09:45:30.000Z',
  latestWebhookSource: 'lorawan'
};

const DEMO_SESSIONS: Session[] = [
  {
    id: DEMO_SESSION_ACTIVE_ID,
    deviceId: DEMO_DEVICE_ID,
    name: 'Morning drive',
    startedAt: '2026-02-09T08:30:00.000Z',
    endedAt: null,
    notes: null,
    isArchived: false
  },
  {
    id: DEMO_SESSION_ARCHIVED_ID,
    deviceId: DEMO_DEVICE_ID,
    name: 'City center pass',
    startedAt: '2026-02-09T06:10:00.000Z',
    endedAt: '2026-02-09T07:00:00.000Z',
    notes: null,
    isArchived: true
  }
];

const DEMO_SESSION_DETAILS: SessionDetail[] = [
  {
    id: DEMO_SESSION_ACTIVE_ID,
    deviceId: DEMO_DEVICE_ID,
    ownerId: null,
    name: 'Morning drive',
    startedAt: '2026-02-09T08:30:00.000Z',
    endedAt: null,
    notes: null,
    isArchived: false,
    archivedAt: null,
    updatedAt: '2026-02-09T09:45:00.000Z',
    measurementCount: 148
  },
  {
    id: DEMO_SESSION_ARCHIVED_ID,
    deviceId: DEMO_DEVICE_ID,
    ownerId: null,
    name: 'City center pass',
    startedAt: '2026-02-09T06:10:00.000Z',
    endedAt: '2026-02-09T07:00:00.000Z',
    notes: null,
    isArchived: true,
    archivedAt: '2026-02-09T08:00:00.000Z',
    updatedAt: '2026-02-09T08:00:00.000Z',
    measurementCount: 92
  }
];

const DEMO_AUTO_SESSION: AutoSessionConfig = {
  enabled: true,
  homeLat: 37.7749,
  homeLon: -122.4194,
  radiusMeters: 20,
  minOutsideSeconds: 30,
  minInsideSeconds: 120
};

const DEMO_MEASUREMENT: Measurement = {
  id: 'ui-kit-point-1',
  deviceId: DEMO_DEVICE_ID,
  sessionId: DEMO_SESSION_ACTIVE_ID,
  capturedAt: '2026-02-09T09:42:11.000Z',
  lat: 37.77531,
  lon: -122.41874,
  alt: 21,
  rssi: -84,
  snr: 7.8,
  sf: 7,
  bw: 125,
  freq: 868.3,
  gatewayId: 'gw-ui-kit-01'
};

const DEMO_STATS: StatsResponse = {
  count: 148,
  minCapturedAt: '2026-02-09T08:30:05.000Z',
  maxCapturedAt: '2026-02-09T09:45:00.000Z',
  gatewayCount: 4
};

const DEMO_PLAYBACK_TIMELINE: SessionTimeline = {
  sessionId: DEMO_SESSION_ACTIVE_ID,
  deviceId: DEMO_DEVICE_ID,
  startedAt: '2026-02-09T08:30:00.000Z',
  endedAt: null,
  minCapturedAt: '2026-02-09T08:30:05.000Z',
  maxCapturedAt: '2026-02-09T09:45:00.000Z',
  count: 148
};

const DEMO_PLAYBACK_WINDOW_ITEMS: SessionWindowPoint[] = [
  {
    id: 'window-1',
    capturedAt: '2026-02-09T09:34:00.000Z',
    lat: 37.7749,
    lon: -122.4194,
    rssi: -88,
    snr: 5.1,
    sf: 7,
    bw: 125,
    freq: 868.1,
    gatewayId: 'gw-ui-kit-01'
  },
  {
    id: 'window-2',
    capturedAt: '2026-02-09T09:36:30.000Z',
    lat: 37.77505,
    lon: -122.4191,
    rssi: -86,
    snr: 6.8,
    sf: 7,
    bw: 125,
    freq: 868.3,
    gatewayId: 'gw-ui-kit-01'
  },
  {
    id: 'window-3',
    capturedAt: '2026-02-09T09:40:00.000Z',
    lat: 37.7752,
    lon: -122.4189,
    rssi: -83,
    snr: 8.4,
    sf: 7,
    bw: 125,
    freq: 868.5,
    gatewayId: 'gw-ui-kit-02'
  }
];

function formatRelativeTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export default function UiKit() {
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<UiKitTheme>('default');
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(DEMO_SESSION_ACTIVE_ID);
  const [playbackSessionId, setPlaybackSessionId] = useState<string | null>(DEMO_SESSION_ACTIVE_ID);
  const [playbackCursorMs, setPlaybackCursorMs] = useState(
    new Date('2026-02-09T09:36:30.000Z').getTime()
  );
  const [playbackWindowMs, setPlaybackWindowMs] = useState(10 * 60 * 1000);
  const [playbackIsPlaying, setPlaybackIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<0.25 | 0.5 | 1 | 2 | 4>(1);

  const themeRootClassName = `theme-${theme}`;
  const rootClassName =
    theme === 'default'
      ? 'app ui-kit-page ui-kit-root'
      : `app ui-kit-page ui-kit-root ${themeRootClassName}`;
  const demoWindowFrom = useMemo(() => new Date('2026-02-09T09:32:00.000Z'), []);
  const demoWindowTo = useMemo(() => new Date('2026-02-09T09:42:00.000Z'), []);

  useEffect(() => {
    queryClient.setQueryDefaults(['sessions', DEMO_DEVICE_ID], { staleTime: Infinity, gcTime: Infinity });
    queryClient.setQueryDefaults(['session'], { staleTime: Infinity, gcTime: Infinity });
    queryClient.setQueryDefaults(['auto-session', DEMO_DEVICE_ID], {
      staleTime: Infinity,
      gcTime: Infinity
    });

    queryClient.setQueryData(['sessions', DEMO_DEVICE_ID, false], {
      items: DEMO_SESSIONS.filter((session) => !session.isArchived),
      count: DEMO_SESSIONS.filter((session) => !session.isArchived).length
    });
    queryClient.setQueryData(['sessions', DEMO_DEVICE_ID, true], {
      items: DEMO_SESSIONS,
      count: DEMO_SESSIONS.length
    });
    queryClient.setQueryData(['auto-session', DEMO_DEVICE_ID], DEMO_AUTO_SESSION);
    for (const session of DEMO_SESSION_DETAILS) {
      queryClient.setQueryData(['session', session.id], session);
    }
  }, [queryClient]);

  return (
    <div className={rootClassName}>
      <MapView showPoints={false} showTrack={false} />

      <div className="ui-kit-status-stage">
        <StatusStrip
          device={DEMO_DEVICE}
          deviceLabel={DEMO_DEVICE.name ?? DEMO_DEVICE.deviceUid}
          latestMeasurementAt={DEMO_DEVICE.latestMeasurementAt}
          latestWebhookSource={DEMO_DEVICE.latestWebhookSource}
          latestWebhookReceivedAt={DEMO_DEVICE.latestWebhookReceivedAt}
          activeSessionId={selectedSessionId}
          formatRelativeTime={formatRelativeTime}
          showThemeSwitcher={true}
          themeMode="system"
          onThemeModeChange={() => undefined}
        />
      </div>

      <div className="controls ui-kit-primary-controls">
        <div className="playback-panel__header">
          <h3>UI Kit</h3>
        </div>

        <div className="controls__group ui-kit-theme-picker">
          <span className="controls__label">Theme</span>
          <div className="controls__segmented" role="radiogroup" aria-label="UI kit theme">
            <label className={`controls__segment ${theme === 'default' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="ui-kit-theme"
                value="default"
                checked={theme === 'default'}
                onChange={() => setTheme('default')}
              />
              Default
            </label>
            <label
              className={`controls__segment ${theme === 'yellow-black-sat' ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="ui-kit-theme"
                value="yellow-black-sat"
                checked={theme === 'yellow-black-sat'}
                onChange={() => setTheme('yellow-black-sat')}
              />
              yellow-black-sat
            </label>
            <label className={`controls__segment ${theme === 'space-map' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="ui-kit-theme"
                value="space-map"
                checked={theme === 'space-map'}
                onChange={() => setTheme('space-map')}
              />
              space-map
            </label>
            <label
              className={`controls__segment ${theme === 'retro-future-gadget' ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="ui-kit-theme"
                value="retro-future-gadget"
                checked={theme === 'retro-future-gadget'}
                onChange={() => setTheme('retro-future-gadget')}
              />
              retro-future-gadget
            </label>
            <label
              className={`controls__segment ${theme === 'white-grid-industrial' ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="ui-kit-theme"
                value="white-grid-industrial"
                checked={theme === 'white-grid-industrial'}
                onChange={() => setTheme('white-grid-industrial')}
              />
              white-grid-industrial
            </label>
            <label className={`controls__segment ${theme === 'white-cyber-hud' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="ui-kit-theme"
                value="white-cyber-hud"
                checked={theme === 'white-cyber-hud'}
                onChange={() => setTheme('white-cyber-hud')}
              />
              white-cyber-hud
            </label>
            <label className={`controls__segment ${theme === 'mono-tech-frame' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="ui-kit-theme"
                value="mono-tech-frame"
                checked={theme === 'mono-tech-frame'}
                onChange={() => setTheme('mono-tech-frame')}
              />
              mono-tech-frame
            </label>
            <label className={`controls__segment ${theme === 'lrm-mono-dark' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="ui-kit-theme"
                value="lrm-mono-dark"
                checked={theme === 'lrm-mono-dark'}
                onChange={() => setTheme('lrm-mono-dark')}
              />
              lrm-mono-dark
            </label>
            <label className={`controls__segment ${theme === 'lrm-mono-light' ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="ui-kit-theme"
                value="lrm-mono-light"
                checked={theme === 'lrm-mono-light'}
                onChange={() => setTheme('lrm-mono-light')}
              />
              lrm-mono-light
            </label>
          </div>
        </div>

        <div className="controls__group">
          <span className="controls__label">Selected Device Header</span>
          <SelectedDeviceHeader
            device={DEMO_DEVICE}
            latestMeasurementAt={DEMO_DEVICE.latestMeasurementAt}
            latestWebhookReceivedAt={DEMO_DEVICE.latestWebhookReceivedAt}
            latestWebhookSource={DEMO_DEVICE.latestWebhookSource}
            fitFeedback="Map recentered to 148 points"
          />
        </div>
      </div>

      <div className="right-column">
        <PlaybackPanel
          deviceId={DEMO_DEVICE_ID}
          sessionId={playbackSessionId}
          onSelectSessionId={setPlaybackSessionId}
          timeline={DEMO_PLAYBACK_TIMELINE}
          timelineLoading={false}
          timelineError={null}
          windowFrom={demoWindowFrom}
          windowTo={demoWindowTo}
          windowCount={DEMO_PLAYBACK_WINDOW_ITEMS.length}
          windowItems={DEMO_PLAYBACK_WINDOW_ITEMS}
          sampleNote="Sampled at 1/3 density for performance"
          emptyNote={null}
          playbackCursorMs={playbackCursorMs}
          onPlaybackCursorMsChange={setPlaybackCursorMs}
          playbackWindowMs={playbackWindowMs}
          onPlaybackWindowMsChange={setPlaybackWindowMs}
          playbackIsPlaying={playbackIsPlaying}
          onPlaybackIsPlayingChange={setPlaybackIsPlaying}
          playbackSpeed={playbackSpeed}
          onPlaybackSpeedChange={setPlaybackSpeed}
        />

        <SessionsPanel
          deviceId={DEMO_DEVICE_ID}
          selectedSessionId={selectedSessionId}
          onSelectSessionId={setSelectedSessionId}
          onStartSession={setSelectedSessionId}
        />

        <PointDetails measurement={DEMO_MEASUREMENT} />
        <StatsCard stats={DEMO_STATS} isLoading={false} error={null} />

        <div className="playback-panel">
          <div className="playback-panel__header">
            <h3>Layout Shell</h3>
          </div>
          <div className="ui-kit-layout-preview">
            <Layout
              sidebarHeader={<div className="sidebar-header">Sidebar Header</div>}
              sidebar={
                <section className="controls" aria-label="Layout preview controls">
                  <div className="controls__group">
                    <span className="controls__label">Preview Control</span>
                    <button type="button" className="controls__button">
                      Action
                    </button>
                  </div>
                </section>
              }
              sidebarCollapsedContent={
                <button type="button" className="layout__rail-icon is-active" aria-label="Device tab">
                  D
                </button>
              }
              sidebarHeaderActions={
                <button type="button" className="layout__toggle-button" aria-label="Help">
                  ?
                </button>
              }
              sidebarHeaderBottomActions={
                <select className="layout__sidebar-theme-select" aria-label="Theme mode">
                  <option>System</option>
                  <option>Light</option>
                  <option>Dark</option>
                </select>
              }
              sidebarFooter={<span className="layout__sidebar-footer-meta">v0.9.12</span>}
              sidebarFooterCollapsed={<span className="layout__sidebar-footer-meta">SB</span>}
            >
              <div className="ui-kit-layout-main">Main Content Area</div>
            </Layout>
          </div>
        </div>

        <div className="controls">
          <Controls
            activeTab="device"
            deviceId={DEMO_DEVICE_ID}
            onDeviceChange={() => undefined}
            filterMode="time"
            onFilterModeChange={() => undefined}
            viewMode="explore"
            onViewModeChange={() => undefined}
            exploreRangePreset="last1h"
            onExploreRangePresetChange={() => undefined}
            useAdvancedRange={false}
            onUseAdvancedRangeChange={() => undefined}
            selectedSessionId={selectedSessionId}
            onSelectSessionId={setSelectedSessionId}
            onStartSession={setSelectedSessionId}
            receiverSource="lorawan"
            onReceiverSourceChange={() => undefined}
            selectedReceiverId={null}
            onSelectReceiverId={() => undefined}
            compareReceiverId={null}
            onSelectCompareReceiverId={() => undefined}
            selectedGatewayId={null}
            onSelectGatewayId={() => undefined}
            compareGatewayId={null}
            onSelectCompareGatewayId={() => undefined}
            latest={null}
            onFitToData={() => undefined}
            onCenterOnLatestLocation={() => undefined}
            mapLayerMode="points"
            onMapLayerModeChange={() => undefined}
            coverageMetric="count"
            onCoverageMetricChange={() => undefined}
            rangeFrom="2026-02-09T08:00:00.000Z"
            rangeTo="2026-02-09T10:00:00.000Z"
            from="2026-02-09T08:00"
            to="2026-02-09T10:00"
            onFromChange={() => undefined}
            onToChange={() => undefined}
            showPoints={true}
            showTrack={true}
            showDeviceMarkers={false}
            onShowDeviceMarkersChange={() => undefined}
            onShowPointsChange={() => undefined}
            onShowTrackChange={() => undefined}
            playbackControls={null}
            fitFeedback={null}
            sessionSelectionNotice={null}
          />
        </div>
      </div>
    </div>
  );
}
