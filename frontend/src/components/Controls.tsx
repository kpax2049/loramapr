import { useEffect, useMemo, useState } from 'react';
import type { AutoSessionConfig, DeviceLatest } from '../api/types';
import {
  useAgentDecisions,
  useAutoSession,
  useDevices,
  useGateways,
  useReceivers,
  useUpdateAutoSession
} from '../query/hooks';
import SessionsPanel from './SessionsPanel';

type ControlsProps = {
  deviceId: string | null;
  onDeviceChange: (deviceId: string | null) => void;
  filterMode: 'time' | 'session';
  onFilterModeChange: (mode: 'time' | 'session') => void;
  viewMode: 'explore' | 'playback';
  onViewModeChange: (mode: 'explore' | 'playback') => void;
  exploreRangePreset: 'last15m' | 'last1h' | 'last6h' | 'last24h' | 'all';
  onExploreRangePresetChange: (
    preset: 'last15m' | 'last1h' | 'last6h' | 'last24h' | 'all'
  ) => void;
  useAdvancedRange: boolean;
  onUseAdvancedRangeChange: (value: boolean) => void;
  selectedSessionId: string | null;
  onSelectSessionId: (sessionId: string | null) => void;
  onStartSession: (sessionId: string) => void;
  receiverSource: 'lorawan' | 'meshtastic';
  onReceiverSourceChange: (source: 'lorawan' | 'meshtastic') => void;
  selectedReceiverId: string | null;
  onSelectReceiverId: (receiverId: string | null) => void;
  compareReceiverId: string | null;
  onSelectCompareReceiverId: (receiverId: string | null) => void;
  selectedGatewayId: string | null;
  onSelectGatewayId: (gatewayId: string | null) => void;
  compareGatewayId: string | null;
  onSelectCompareGatewayId: (gatewayId: string | null) => void;
  latest?: DeviceLatest;
  onFitToData: () => void;
  mapLayerMode: 'points' | 'coverage';
  onMapLayerModeChange: (mode: 'points' | 'coverage') => void;
  coverageMetric: 'count' | 'rssiAvg' | 'snrAvg';
  onCoverageMetricChange: (metric: 'count' | 'rssiAvg' | 'snrAvg') => void;
  rangeFrom?: string | Date;
  rangeTo?: string | Date;
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  showPoints: boolean;
  showTrack: boolean;
  onShowPointsChange: (value: boolean) => void;
  onShowTrackChange: (value: boolean) => void;
};

export default function Controls({
  deviceId,
  onDeviceChange,
  filterMode,
  onFilterModeChange,
  viewMode,
  onViewModeChange,
  exploreRangePreset,
  onExploreRangePresetChange,
  useAdvancedRange,
  onUseAdvancedRangeChange,
  selectedSessionId,
  onSelectSessionId,
  onStartSession,
  receiverSource,
  onReceiverSourceChange,
  selectedReceiverId,
  onSelectReceiverId,
  compareReceiverId,
  onSelectCompareReceiverId,
  selectedGatewayId,
  onSelectGatewayId,
  compareGatewayId,
  onSelectCompareGatewayId,
  latest,
  onFitToData,
  mapLayerMode,
  onMapLayerModeChange,
  coverageMetric,
  onCoverageMetricChange,
  rangeFrom,
  rangeTo,
  from,
  to,
  onFromChange,
  onToChange,
  showPoints,
  showTrack,
  onShowPointsChange,
  onShowTrackChange
}: ControlsProps) {
  const { data: devicesData, isLoading } = useDevices();
  const devices = devicesData?.items ?? [];
  const selectedDevice = devices.find((device) => device.id === deviceId) ?? null;
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [autoSessionForm, setAutoSessionForm] = useState({
    enabled: false,
    homeLat: '',
    homeLon: '',
    radiusMeters: '20',
    minOutsideSeconds: '30',
    minInsideSeconds: '120'
  });
  const [autoSessionDirty, setAutoSessionDirty] = useState(false);
  const [autoSessionError, setAutoSessionError] = useState<string | null>(null);
  const autoSessionQuery = useAutoSession(deviceId, { enabled: Boolean(deviceId) });
  const updateAutoSessionMutation = useUpdateAutoSession(deviceId);
  const autoSessionStatus = getErrorStatus(autoSessionQuery.error);
  const autoSessionMutationStatus = getErrorStatus(updateAutoSessionMutation.error);
  const autoSessionAuthError =
    autoSessionStatus === 401 ||
    autoSessionStatus === 403 ||
    autoSessionMutationStatus === 401 ||
    autoSessionMutationStatus === 403;

  const agentDecisionsQuery = useAgentDecisions(deviceId, 1, { enabled: Boolean(deviceId) });
  const agentDecisionStatus = getErrorStatus(agentDecisionsQuery.error);
  const agentDecisionAuthError = agentDecisionStatus === 401 || agentDecisionStatus === 403;
  const agentDecision = agentDecisionsQuery.data?.items?.[0] ?? null;
  const agentDecisionTime = agentDecision?.capturedAt ?? agentDecision?.createdAt ?? null;
  const showAgentDecision = Boolean(agentDecision) && !agentDecisionAuthError;

  const autoSessionConfig = autoSessionQuery.data;
  const autoSessionDefaults = useMemo(
    () => ({
      enabled: autoSessionConfig?.enabled ?? false,
      homeLat: autoSessionConfig?.homeLat !== null && autoSessionConfig?.homeLat !== undefined
        ? String(autoSessionConfig.homeLat)
        : '',
      homeLon: autoSessionConfig?.homeLon !== null && autoSessionConfig?.homeLon !== undefined
        ? String(autoSessionConfig.homeLon)
        : '',
      radiusMeters:
        autoSessionConfig?.radiusMeters !== null && autoSessionConfig?.radiusMeters !== undefined
          ? String(autoSessionConfig.radiusMeters)
          : '20',
      minOutsideSeconds:
        autoSessionConfig?.minOutsideSeconds !== null &&
        autoSessionConfig?.minOutsideSeconds !== undefined
          ? String(autoSessionConfig.minOutsideSeconds)
          : '30',
      minInsideSeconds:
        autoSessionConfig?.minInsideSeconds !== null &&
        autoSessionConfig?.minInsideSeconds !== undefined
          ? String(autoSessionConfig.minInsideSeconds)
          : '120'
    }),
    [autoSessionConfig]
  );

  useEffect(() => {
    setAutoSessionDirty(false);
    setAutoSessionError(null);
  }, [deviceId]);

  useEffect(() => {
    if (!autoSessionConfig || autoSessionDirty) {
      return;
    }
    setAutoSessionForm(autoSessionDefaults);
  }, [autoSessionConfig, autoSessionDefaults, autoSessionDirty]);
  const gatewayScope =
    filterMode === 'session'
      ? {
          sessionId: selectedSessionId ?? undefined
        }
      : {
          deviceId: deviceId ?? undefined,
          from: rangeFrom,
          to: rangeTo
        };
  const gatewayScopeEnabled =
    filterMode === 'session' ? Boolean(selectedSessionId) : Boolean(deviceId);
  const gatewaysQuery = useGateways(
    gatewayScope,
    { enabled: gatewayScopeEnabled && receiverSource === 'lorawan' },
    { filterMode }
  );
  const gatewayOptions = gatewaysQuery.data?.items ?? [];
  const gatewayErrorStatus = getErrorStatus(gatewaysQuery.error);

  const receiverScope =
    filterMode === 'session'
      ? {
          sessionId: selectedSessionId ?? undefined
        }
      : {
          deviceId: deviceId ?? undefined,
          from: rangeFrom,
          to: rangeTo
        };
  const receiverScopeEnabled =
    filterMode === 'session' ? Boolean(selectedSessionId) : Boolean(deviceId);
  const receiversQuery = useReceivers(
    { source: receiverSource, ...receiverScope },
    { enabled: receiverScopeEnabled && receiverSource === 'meshtastic' },
    { filterMode }
  );
  const receiverOptions = receiversQuery.data?.items ?? [];
  const receiverErrorStatus = getErrorStatus(receiversQuery.error);

  useEffect(() => {
    if (!deviceId && devices.length > 0) {
      onDeviceChange(devices[0].id);
    }
  }, [deviceId, devices, onDeviceChange]);

  useEffect(() => {
    setExportError(null);
  }, [selectedSessionId, filterMode]);

  const updateAutoSessionField = (field: keyof typeof autoSessionForm, value: string | boolean) => {
    setAutoSessionDirty(true);
    setAutoSessionForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleAutoSessionSave = () => {
    if (!deviceId) {
      return;
    }
    setAutoSessionError(null);

    const parseNumber = (value: string): number | null => {
      if (value.trim() === '') {
        return null;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const payload: AutoSessionConfig = {
      enabled: Boolean(autoSessionForm.enabled),
      homeLat: parseNumber(autoSessionForm.homeLat),
      homeLon: parseNumber(autoSessionForm.homeLon),
      radiusMeters: parseNumber(autoSessionForm.radiusMeters),
      minOutsideSeconds: parseNumber(autoSessionForm.minOutsideSeconds),
      minInsideSeconds: parseNumber(autoSessionForm.minInsideSeconds)
    };

    const numericFields: Array<[string, number | null]> = [
      ['homeLat', payload.homeLat],
      ['homeLon', payload.homeLon],
      ['radiusMeters', payload.radiusMeters],
      ['minOutsideSeconds', payload.minOutsideSeconds],
      ['minInsideSeconds', payload.minInsideSeconds]
    ];
    const hasInvalid = numericFields.some(([, value]) => value === null);
    if (hasInvalid) {
      setAutoSessionError('Enter valid numeric values for all fields.');
      return;
    }

    updateAutoSessionMutation.mutate(payload, {
      onSuccess: () => {
        setAutoSessionDirty(false);
      }
    });
  };

  return (
    <section className="controls" aria-label="Map controls">
      <div className="controls__group">
        <label htmlFor="device-select">Device</label>
        <select
          id="device-select"
          value={deviceId ?? ''}
          onChange={(event) => onDeviceChange(event.target.value || null)}
          disabled={isLoading || devices.length === 0}
        >
          <option value="">
            {isLoading ? 'Loading devices...' : 'Select a device'}
          </option>
          {devices.map((device) => (
            <option key={device.id} value={device.id}>
              {formatDeviceLabel(device.name, device.deviceUid)}
            </option>
          ))}
        </select>
      {selectedDevice ? (
        <div className="controls__device-meta">
          <span>{formatDeviceLabel(selectedDevice.name, selectedDevice.deviceUid)}</span>
          <button
            type="button"
            className="controls__button controls__button--compact"
            onClick={() => copyDeviceUid(selectedDevice.deviceUid)}
          >
            Copy deviceUid
          </button>
        </div>
      ) : null}
    </div>

      {deviceId && (
        <div className="controls__group">
          <span className="controls__label">Auto Session (Home Geofence)</span>
          <label className="controls__toggle">
            <input
              type="checkbox"
              checked={autoSessionForm.enabled}
              onChange={(event) => updateAutoSessionField('enabled', event.target.checked)}
            />
            Enabled
          </label>
          <div className="controls__row">
            <div className="controls__group">
              <label htmlFor="auto-home-lat">homeLat</label>
              <input
                id="auto-home-lat"
                type="number"
                value={autoSessionForm.homeLat}
                onChange={(event) => updateAutoSessionField('homeLat', event.target.value)}
              />
            </div>
            <div className="controls__group">
              <label htmlFor="auto-home-lon">homeLon</label>
              <input
                id="auto-home-lon"
                type="number"
                value={autoSessionForm.homeLon}
                onChange={(event) => updateAutoSessionField('homeLon', event.target.value)}
              />
            </div>
          </div>
          <div className="controls__row">
            <div className="controls__group">
              <label htmlFor="auto-radius">radiusMeters</label>
              <input
                id="auto-radius"
                type="number"
                value={autoSessionForm.radiusMeters}
                onChange={(event) => updateAutoSessionField('radiusMeters', event.target.value)}
              />
            </div>
            <div className="controls__group">
              <label htmlFor="auto-min-outside">minOutsideSeconds</label>
              <input
                id="auto-min-outside"
                type="number"
                value={autoSessionForm.minOutsideSeconds}
                onChange={(event) => updateAutoSessionField('minOutsideSeconds', event.target.value)}
              />
            </div>
          </div>
          <div className="controls__row">
            <div className="controls__group">
              <label htmlFor="auto-min-inside">minInsideSeconds</label>
              <input
                id="auto-min-inside"
                type="number"
                value={autoSessionForm.minInsideSeconds}
                onChange={(event) => updateAutoSessionField('minInsideSeconds', event.target.value)}
              />
            </div>
          </div>
          <button
            type="button"
            className="controls__button"
            onClick={handleAutoSessionSave}
            disabled={autoSessionQuery.isLoading || updateAutoSessionMutation.isPending}
          >
            {updateAutoSessionMutation.isPending ? 'Saving…' : 'Save'}
          </button>
          {autoSessionAuthError ? (
            <div className="controls__gateway-error">
              Auto session requires QUERY key
            </div>
          ) : null}
          {autoSessionError ? (
            <div className="controls__gateway-error">{autoSessionError}</div>
          ) : null}
        </div>
      )}

      <div className="controls__group">
        <span className="controls__label">Filter mode</span>
        <div className="controls__segmented" role="radiogroup" aria-label="Filter mode">
          <label className={`controls__segment ${filterMode === 'time' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="filter-mode"
              value="time"
              checked={filterMode === 'time'}
              onChange={() => onFilterModeChange('time')}
            />
            Time
          </label>
          <label className={`controls__segment ${filterMode === 'session' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="filter-mode"
              value="session"
              checked={filterMode === 'session'}
              onChange={() => onFilterModeChange('session')}
            />
            Session
          </label>
        </div>
      </div>

      <div className="controls__group">
        <span className="controls__label">View mode</span>
        <div className="controls__segmented" role="radiogroup" aria-label="View mode">
          <label className={`controls__segment ${viewMode === 'explore' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="view-mode"
              value="explore"
              checked={viewMode === 'explore'}
              onChange={() => onViewModeChange('explore')}
            />
            Explore
          </label>
          <label className={`controls__segment ${viewMode === 'playback' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="view-mode"
              value="playback"
              checked={viewMode === 'playback'}
              onChange={() => onViewModeChange('playback')}
            />
            Playback
          </label>
        </div>
      </div>

      <div className="controls__group">
        <span className="controls__label">Map layer</span>
        <div className="controls__segmented" role="radiogroup" aria-label="Map layer">
          <label className={`controls__segment ${mapLayerMode === 'points' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="map-mode"
              value="points"
              checked={mapLayerMode === 'points'}
              onChange={() => onMapLayerModeChange('points')}
            />
            Points
          </label>
          <label className={`controls__segment ${mapLayerMode === 'coverage' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="map-mode"
              value="coverage"
              checked={mapLayerMode === 'coverage'}
              onChange={() => onMapLayerModeChange('coverage')}
            />
            Coverage
          </label>
        </div>
      </div>

      {mapLayerMode === 'coverage' ? (
        <div className="controls__group">
          <label htmlFor="coverage-metric">Coverage metric</label>
          <select
            id="coverage-metric"
            value={coverageMetric}
            onChange={(event) => onCoverageMetricChange(event.target.value as 'count' | 'rssiAvg' | 'snrAvg')}
          >
            <option value="count">Count</option>
            <option value="rssiAvg">RSSI avg</option>
            <option value="snrAvg">SNR avg</option>
          </select>
          <CoverageLegend metric={coverageMetric} />
        </div>
      ) : null}

      {filterMode === 'time' ? (
        <>
          <div className="controls__group">
            <label htmlFor="range-preset">Range</label>
            <select
              id="range-preset"
              value={exploreRangePreset}
              onChange={(event) =>
                onExploreRangePresetChange(
                  event.target.value as
                    | 'last15m'
                    | 'last1h'
                    | 'last6h'
                    | 'last24h'
                    | 'all'
                )
              }
            >
              <option value="last15m">Last 15m</option>
              <option value="last1h">Last 1h</option>
              <option value="last6h">Last 6h</option>
              <option value="last24h">Last 24h</option>
              <option value="all">All</option>
            </select>
            <label className="controls__toggle">
              <input
                type="checkbox"
                checked={useAdvancedRange}
                onChange={(event) => onUseAdvancedRangeChange(event.target.checked)}
              />
              Advanced
            </label>
          </div>
          {useAdvancedRange && (
            <div className="controls__row">
              <div className="controls__group">
                <label htmlFor="from-input">From</label>
                <input
                  id="from-input"
                  type="datetime-local"
                  value={from}
                  onChange={(event) => onFromChange(event.target.value)}
                />
              </div>
              <div className="controls__group">
                <label htmlFor="to-input">To</label>
                <input
                  id="to-input"
                  type="datetime-local"
                  value={to}
                  onChange={(event) => onToChange(event.target.value)}
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="controls__group">
          {deviceId ? (
            <>
              <SessionsPanel
                deviceId={deviceId}
                selectedSessionId={selectedSessionId}
                onSelectSessionId={onSelectSessionId}
                onStartSession={onStartSession}
              />
              {selectedSessionId ? (
                <>
                  <button
                    type="button"
                    className="controls__button"
                    onClick={() => void handleExport(selectedSessionId, setExportError, setIsExporting)}
                    disabled={isExporting}
                  >
                    {isExporting ? 'Exporting…' : 'Export GeoJSON'}
                  </button>
                  {exportError ? (
                    <div className="controls__export-error">{exportError}</div>
                  ) : null}
                </>
              ) : null}
            </>
          ) : (
            <span className="controls__label">Select a device</span>
          )}
        </div>
      )}

      <div className="controls__group">
        <span className="controls__label">Receiver source</span>
        <div className="controls__segmented" role="radiogroup" aria-label="Receiver source">
          <label className={`controls__segment ${receiverSource === 'lorawan' ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="receiver-source"
              value="lorawan"
              checked={receiverSource === 'lorawan'}
              onChange={() => onReceiverSourceChange('lorawan')}
            />
            LoRaWAN
          </label>
          <label
            className={`controls__segment ${receiverSource === 'meshtastic' ? 'is-active' : ''}`}
          >
            <input
              type="radio"
              name="receiver-source"
              value="meshtastic"
              checked={receiverSource === 'meshtastic'}
              onChange={() => onReceiverSourceChange('meshtastic')}
            />
            Meshtastic
          </label>
        </div>
      </div>

      <div className="controls__group">
        {receiverSource === 'meshtastic' ? (
          <>
            <label htmlFor="receiver-select">Receiver</label>
            <select
              id="receiver-select"
              value={selectedReceiverId ?? ''}
              onChange={(event) => onSelectReceiverId(event.target.value || null)}
              disabled={!receiverScopeEnabled || receiverOptions.length === 0}
            >
              <option value="">All receivers</option>
              {receiverOptions.map((receiver) => (
                <option key={receiver.id} value={receiver.id}>
                  {receiver.id} ({receiver.count})
                </option>
              ))}
            </select>
            <label htmlFor="receiver-compare">Compare receiver</label>
            <select
              id="receiver-compare"
              value={compareReceiverId ?? ''}
              onChange={(event) => onSelectCompareReceiverId(event.target.value || null)}
              disabled={!receiverScopeEnabled || !selectedReceiverId || receiverOptions.length === 0}
            >
              <option value="">No comparison</option>
              {receiverOptions.map((receiver) => (
                <option key={`compare-${receiver.id}`} value={receiver.id}>
                  {receiver.id} ({receiver.count})
                </option>
              ))}
            </select>
            {receiverErrorStatus === 401 || receiverErrorStatus === 403 ? (
              <div className="controls__gateway-error">Receiver analysis requires QUERY key</div>
            ) : null}
          </>
        ) : (
          <>
            <label htmlFor="gateway-select">Gateway</label>
            <select
              id="gateway-select"
              value={selectedGatewayId ?? ''}
              onChange={(event) => onSelectGatewayId(event.target.value || null)}
              disabled={!gatewayScopeEnabled || gatewayOptions.length === 0}
            >
              <option value="">All gateways</option>
              {gatewayOptions.map((gateway) => (
                <option key={gateway.gatewayId} value={gateway.gatewayId}>
                  {gateway.gatewayId} ({gateway.count})
                </option>
              ))}
            </select>
            <label htmlFor="gateway-compare">Compare gateway</label>
            <select
              id="gateway-compare"
              value={compareGatewayId ?? ''}
              onChange={(event) => onSelectCompareGatewayId(event.target.value || null)}
              disabled={!gatewayScopeEnabled || !selectedGatewayId || gatewayOptions.length === 0}
            >
              <option value="">No comparison</option>
              {gatewayOptions.map((gateway) => (
                <option key={`compare-${gateway.gatewayId}`} value={gateway.gatewayId}>
                  {gateway.gatewayId} ({gateway.count})
                </option>
              ))}
            </select>
            {gatewayErrorStatus === 401 || gatewayErrorStatus === 403 ? (
              <div className="controls__gateway-error">Gateway analysis requires QUERY key</div>
            ) : null}
          </>
        )}
      </div>

      <div className="controls__group">
        <span className="controls__label">Map</span>
        <button type="button" className="controls__button" onClick={onFitToData}>
          Fit to data
        </button>
      </div>

      <div className="controls__group">
        <span className="controls__label">Layers</span>
        <label className="controls__toggle">
          <input
            type="checkbox"
            checked={showPoints}
            onChange={(event) => onShowPointsChange(event.target.checked)}
            disabled={mapLayerMode === 'coverage'}
          />
          Show points
        </label>
        <label className="controls__toggle">
          <input
            type="checkbox"
            checked={showTrack}
            onChange={(event) => onShowTrackChange(event.target.checked)}
          />
          Show track
        </label>
      </div>

      {(latest?.latestMeasurementAt ||
        latest?.latestWebhookReceivedAt ||
        latest?.latestWebhookError ||
        latest?.latestWebhookSource ||
        autoSessionConfig ||
        showAgentDecision) && (
        <div className="controls__status" aria-live="polite">
          {latest?.latestMeasurementAt && (
            <div className="controls__status-row">
              <span>Last measurement:</span>
              <strong>{formatRelativeTime(latest.latestMeasurementAt)}</strong>
            </div>
          )}
          {(latest?.latestWebhookReceivedAt || latest?.latestWebhookError) && (
            <div
              className={`controls__status-row ${
                latest?.latestWebhookError ? 'controls__status-error' : ''
              }`}
            >
              <span>Last webhook:</span>
              <strong>
                {latest?.latestWebhookReceivedAt
                  ? formatRelativeTime(latest.latestWebhookReceivedAt)
                  : '—'}
                {latest?.latestWebhookError ? ` (${latest.latestWebhookError})` : ''}
              </strong>
            </div>
          )}
          {(latest?.latestWebhookSource || latest?.latestWebhookReceivedAt) && (
            <div className="controls__status-row">
              <span>Last ingest:</span>
              <strong>
                {latest?.latestWebhookSource ?? '—'} @{' '}
                {latest?.latestWebhookReceivedAt
                  ? formatRelativeTime(latest.latestWebhookReceivedAt)
                  : '—'}
              </strong>
            </div>
          )}
          {autoSessionConfig && (
            <div className="controls__status-row">
              <span>Auto session:</span>
              <strong>{autoSessionConfig.enabled ? 'enabled' : 'disabled'}</strong>
            </div>
          )}
          {autoSessionConfig?.enabled && autoSessionConfig.radiusMeters !== null && (
            <div className="controls__status-row">
              <span>Home radius:</span>
              <strong>{Math.round(autoSessionConfig.radiusMeters)}m</strong>
            </div>
          )}
          {showAgentDecision && (
            <div className="controls__status-row">
              <span>Agent:</span>
              <strong>
                last decision {agentDecision?.decision ?? '—'} @{' '}
                {agentDecisionTime ? formatRelativeTime(agentDecisionTime) : '—'}
                {agentDecision?.reason ? ` (${agentDecision.reason})` : ''}
              </strong>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');
  return raw;
}

async function handleExport(
  sessionId: string,
  setExportError: (value: string | null) => void,
  setIsExporting: (value: boolean) => void
): Promise<void> {
  if (typeof window === 'undefined') {
    return;
  }
  setExportError(null);
  setIsExporting(true);
  try {
    const apiBaseUrl = getApiBaseUrl();
    const url = `${apiBaseUrl}/api/export/session/${sessionId}.geojson`;
    const queryKey = import.meta.env.VITE_QUERY_API_KEY ?? '';
    const headers = queryKey ? { 'X-API-Key': queryKey } : undefined;
    const response = await fetch(url, { headers });
    if (response.status === 401 || response.status === 403) {
      setExportError('Export requires QUERY key');
      return;
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `Export failed (${response.status})`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = `session-${sessionId}.geojson`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    setExportError('Export failed');
  } finally {
    setIsExporting(false);
  }
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

function formatDeviceLabel(name: string | null | undefined, deviceUid: string): string {
  const trimmedName = name?.trim();
  if (!trimmedName) {
    return deviceUid;
  }
  if (trimmedName.toLowerCase() === deviceUid.toLowerCase()) {
    return deviceUid;
  }
  return `${trimmedName} (${deviceUid})`;
}

function copyDeviceUid(deviceUid: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(deviceUid).catch(() => undefined);
    return;
  }
  try {
    const input = document.createElement('input');
    input.value = deviceUid;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  } catch {
    // no-op: avoid noisy errors
  }
}

type CoverageLegendItem = {
  label: string;
  bucket: 'low' | 'med' | 'high';
};

function CoverageLegend({ metric }: { metric: 'count' | 'rssiAvg' | 'snrAvg' }) {
  const items: CoverageLegendItem[] =
    metric === 'count'
      ? [
          { label: '1-5', bucket: 'low' },
          { label: '6-20', bucket: 'med' },
          { label: '21+', bucket: 'high' }
        ]
      : metric === 'snrAvg'
        ? [
            { label: '<= -5 dB', bucket: 'low' },
            { label: '-4 to 5 dB', bucket: 'med' },
            { label: '>= 6 dB', bucket: 'high' }
          ]
        : [
            { label: '<= -110 dBm', bucket: 'low' },
            { label: '-109 to -90 dBm', bucket: 'med' },
            { label: '>= -89 dBm', bucket: 'high' }
          ];

  return (
    <div className="controls__legend" aria-label="Coverage legend">
      {items.map((item) => (
        <div key={item.label} className="controls__legend-row">
          <span className={`controls__legend-swatch coverage-bin coverage-bin--${item.bucket}`} />
          <span>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function getErrorStatus(error: unknown): number | null {
  if (typeof error === 'object' && error && 'status' in error) {
    const status = (error as { status?: number }).status;
    return typeof status === 'number' ? status : null;
  }
  return null;
}
