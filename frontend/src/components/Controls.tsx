import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { AutoSessionConfig, DeviceLatest } from '../api/types';
import {
  useAgentDecisions,
  useAutoSession,
  useDeviceDetail,
  useDevices,
  useGateways,
  useReceivers,
  useUpdateAutoSession,
  useUpdateDevice
} from '../query/hooks';
import { getDeviceOnlineStatuses, type DeviceStatusBucket } from '../utils/deviceOnlineStatus';
import { useLorawanEvents } from '../query/lorawan';
import { useMeshtasticEvents } from '../query/meshtastic';
import GatewayStatsPanel from './GatewayStatsPanel';
import LorawanEventsPanel from './LorawanEventsPanel';
import MeshtasticEventsPanel from './MeshtasticEventsPanel';
import ReceiverStatsPanel from './ReceiverStatsPanel';
import SessionsPanel from './SessionsPanel';
import DeviceIcon, {
  DEVICE_ICON_CATALOG,
  type DeviceIconKey,
  buildDeviceIdentityLabel,
  getDeviceIconDefinition,
  getEffectiveIconKey
} from './DeviceIcon';
import DeviceOnlineDot from './DeviceOnlineDot';
import DevicesManager from './DevicesManager';

const DEVICE_ICON_PICKER_OPTIONS = DEVICE_ICON_CATALOG;

type ControlsProps = {
  activeTab: 'device' | 'sessions' | 'playback' | 'coverage' | 'debug';
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
  onCenterOnLatestLocation: (point: [number, number]) => void;
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
  showDeviceMarkers: boolean;
  onShowDeviceMarkersChange: (value: boolean) => void;
  onShowPointsChange: (value: boolean) => void;
  onShowTrackChange: (value: boolean) => void;
  playbackControls?: ReactNode;
  fitFeedback?: string | null;
  sessionSelectionNotice?: string | null;
};

export default function Controls({
  activeTab,
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
  onCenterOnLatestLocation,
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
  showDeviceMarkers,
  onShowDeviceMarkersChange,
  onShowPointsChange,
  onShowTrackChange,
  playbackControls,
  fitFeedback,
  sessionSelectionNotice
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
  const [detailsExpanded, setDetailsExpanded] = useState(true);
  const [detailsNameDraft, setDetailsNameDraft] = useState('');
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [notesModalOpen, setNotesModalOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState('');
  const [devicePickerOpen, setDevicePickerOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const devicePickerRef = useRef<HTMLDivElement | null>(null);
  const iconPickerRef = useRef<HTMLDivElement | null>(null);
  const autoSessionQuery = useAutoSession(deviceId, { enabled: Boolean(deviceId) });
  const updateAutoSessionMutation = useUpdateAutoSession(deviceId);
  const updateDeviceMutation = useUpdateDevice();
  const deviceDetailQuery = useDeviceDetail(deviceId, { enabled: Boolean(deviceId) });
  const deviceDetail = deviceDetailQuery.data;
  const deviceDetailErrorStatus = getErrorStatus(deviceDetailQuery.error);
  const autoSessionStatus = getErrorStatus(autoSessionQuery.error);
  const autoSessionMutationStatus = getErrorStatus(updateAutoSessionMutation.error);
  const autoSessionAuthError =
    autoSessionStatus === 401 ||
    autoSessionStatus === 403 ||
    autoSessionMutationStatus === 401 ||
    autoSessionMutationStatus === 403;
  const hasQueryApiKey = Boolean((import.meta.env.VITE_QUERY_API_KEY ?? '').trim());

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
    setDetailsError(null);
    setNotesModalOpen(false);
    setDevicePickerOpen(false);
    setIconPickerOpen(false);
  }, [deviceId]);

  useEffect(() => {
    if (!iconPickerOpen && !devicePickerOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (iconPickerRef.current && target && !iconPickerRef.current.contains(target)) {
        setIconPickerOpen(false);
      }
      if (devicePickerRef.current && target && !devicePickerRef.current.contains(target)) {
        setDevicePickerOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [iconPickerOpen, devicePickerOpen]);

  useEffect(() => {
    setDetailsNameDraft(deviceDetail?.name ?? '');
    setNotesDraft(deviceDetail?.notes ?? '');
  }, [deviceDetail?.id, deviceDetail?.name, deviceDetail?.notes]);

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

  const showDeviceTab = activeTab === 'device';
  const showSessionsTab = activeTab === 'sessions';
  const showPlaybackTab = activeTab === 'playback';
  const showCoverageTab = activeTab === 'coverage';
  const showDebugTab = activeTab === 'debug';
  const isPlaybackMode = viewMode === 'playback';
  const selectedReceiver =
    receiverOptions.find((receiver) => receiver.id === selectedReceiverId) ?? null;
  const debugProbeEnabled = showDebugTab && hasQueryApiKey;
  const lorawanDebugProbe = useLorawanEvents(selectedDevice?.deviceUid, 1, debugProbeEnabled);
  const meshtasticDebugProbe = useMeshtasticEvents(selectedDevice?.deviceUid, 1, debugProbeEnabled);
  const lorawanDebugStatus = getErrorStatus(lorawanDebugProbe.error);
  const meshtasticDebugStatus = getErrorStatus(meshtasticDebugProbe.error);
  const debugAuthError =
    !hasQueryApiKey ||
    lorawanDebugStatus === 401 ||
    lorawanDebugStatus === 403 ||
    meshtasticDebugStatus === 401 ||
    meshtasticDebugStatus === 403 ||
    gatewayErrorStatus === 401 ||
    gatewayErrorStatus === 403 ||
    receiverErrorStatus === 401 ||
    receiverErrorStatus === 403;

  const latestLocation = deviceDetail?.latestMeasurement ?? null;
  const latestMeasurementTimestamp = latest?.latestMeasurementAt ?? latestLocation?.capturedAt ?? null;
  const latestWebhookTimestamp = latest?.latestWebhookReceivedAt ?? null;
  const latestWebhookSourceLabel =
    typeof latest?.latestWebhookSource === 'string' && latest.latestWebhookSource.trim().length > 0
      ? latest.latestWebhookSource.trim()
      : 'unknown';
  const { measurementStatus, webhookStatus } = getDeviceOnlineStatuses({
    latestMeasurementAt: latestMeasurementTimestamp,
    latestWebhookReceivedAt: latestWebhookTimestamp
  });
  const measurementStatusLabel = formatDeviceStatusBucket(measurementStatus);
  const webhookStatusLabel = formatDeviceStatusBucket(webhookStatus);
  const canCenterOnLatest = Boolean(
    latestLocation && Number.isFinite(latestLocation.lat) && Number.isFinite(latestLocation.lon)
  );
  const meshtasticLongName = normalizeOptionalText(deviceDetail?.longName);
  const meshtasticShortName = normalizeOptionalText(deviceDetail?.shortName);
  const meshtasticHwModel = normalizeOptionalText(deviceDetail?.hwModel);
  const meshtasticFirmwareVersion = normalizeOptionalText(deviceDetail?.firmwareVersion);
  const meshtasticAppVersion = normalizeOptionalText(deviceDetail?.appVersion);
  const meshtasticRole = normalizeOptionalText(deviceDetail?.role);
  const meshtasticLastNodeInfoAt = deviceDetail?.lastNodeInfoAt ?? null;
  const detailIconInput = useMemo(
    () => ({
      deviceUid: deviceDetail?.deviceUid ?? selectedDevice?.deviceUid ?? null,
      name: deviceDetail?.name ?? selectedDevice?.name ?? null,
      longName: deviceDetail?.longName ?? selectedDevice?.longName ?? null,
      shortName: deviceDetail?.shortName ?? null,
      hwModel: deviceDetail?.hwModel ?? selectedDevice?.hwModel ?? null,
      role: deviceDetail?.role ?? null,
      iconKey: deviceDetail?.iconKey ?? selectedDevice?.iconKey ?? null,
      iconOverride: deviceDetail?.iconOverride ?? selectedDevice?.iconOverride ?? false
    }),
    [deviceDetail, selectedDevice]
  );
  const detailIconKey = getEffectiveIconKey(detailIconInput);
  const detailIcon = getDeviceIconDefinition(detailIconKey);
  const iconOverrideKey = typeof detailIconInput.iconKey === 'string' ? detailIconInput.iconKey.trim() : '';
  const iconOverrideActive = detailIconInput.iconOverride === true && iconOverrideKey.length > 0;
  const currentIconPickerValue: DeviceIconKey =
    iconOverrideActive && isDeviceIconPickerValue(iconOverrideKey) ? iconOverrideKey : 'auto';
  const iconControlsEnabled = Boolean(deviceDetail && hasQueryApiKey);
  const iconCanEdit = iconControlsEnabled && !updateDeviceMutation.isPending;
  const hasMeshtasticSection = Boolean(
    meshtasticLongName ||
      meshtasticShortName ||
      meshtasticHwModel ||
      meshtasticFirmwareVersion ||
      meshtasticAppVersion ||
      meshtasticRole ||
      meshtasticLastNodeInfoAt
  );
  const detailsNameDirty = (detailsNameDraft ?? '').trim() !== (deviceDetail?.name ?? '').trim();
  const notesPreviewRaw = deviceDetail?.notes ?? '';
  const notesPreview =
    notesPreviewRaw.length > 120 ? `${notesPreviewRaw.slice(0, 120)}...` : notesPreviewRaw || '—';

  const handleSaveDetailsName = () => {
    if (!deviceDetail || !hasQueryApiKey || !detailsNameDirty) {
      return;
    }
    setDetailsError(null);
    updateDeviceMutation.mutate(
      {
        deviceId: deviceDetail.id,
        data: { name: detailsNameDraft.trim() }
      },
      {
        onSuccess: () => {
          setDetailsError(null);
        },
        onError: (error) => {
          const status = getErrorStatus(error);
          setDetailsError(
            status === 401 || status === 403
              ? 'Editing device details requires QUERY key'
              : 'Could not save device name'
          );
        }
      }
    );
  };

  const handleSaveNotes = () => {
    if (!deviceDetail || !hasQueryApiKey) {
      return;
    }
    setDetailsError(null);
    updateDeviceMutation.mutate(
      {
        deviceId: deviceDetail.id,
        data: { notes: notesDraft }
      },
      {
        onSuccess: () => {
          setDetailsError(null);
          setNotesModalOpen(false);
        },
        onError: (error) => {
          const status = getErrorStatus(error);
          setDetailsError(
            status === 401 || status === 403
              ? 'Editing device details requires QUERY key'
              : 'Could not save device notes'
          );
        }
      }
    );
  };

  const handleOpenIconPicker = () => {
    if (!iconCanEdit) {
      return;
    }
    setIconPickerOpen((value) => !value);
  };

  const handleSelectIcon = (valueRaw: string) => {
    if (!deviceDetail || !hasQueryApiKey) {
      return;
    }
    const selectedValue = sanitizeIconPickerValue(valueRaw, currentIconPickerValue);
    setIconPickerOpen(false);

    if (selectedValue === currentIconPickerValue) {
      return;
    }

    setDetailsError(null);
    updateDeviceMutation.mutate(
      {
        deviceId: deviceDetail.id,
        data:
          selectedValue === 'auto'
            ? { iconOverride: false, iconKey: null }
            : { iconOverride: true, iconKey: selectedValue }
      },
      {
        onSuccess: () => {
          setDetailsError(null);
        },
        onError: (error) => {
          const status = getErrorStatus(error);
          setDetailsError(
            status === 401 || status === 403
              ? 'Editing device details requires QUERY key'
              : 'Could not update device icon'
          );
        }
      }
    );
  };

  const handleOpenAutoSessionShortcut = () => {
    if (typeof window === 'undefined') {
      return;
    }
    const target = document.getElementById('auto-session-section');
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="controls" aria-label="Map controls">
      {sessionSelectionNotice && (showSessionsTab || showPlaybackTab) ? (
        <div className="controls__session-notice" role="status" aria-live="polite">
          {sessionSelectionNotice}
        </div>
      ) : null}
      {showDeviceTab && (
        <div className="controls__group">
          <label className="controls__label">Device</label>
          <div className="controls__device-picker" ref={devicePickerRef} data-tour="device-picker">
            <button
              type="button"
              className="controls__device-picker-trigger"
              onClick={() => setDevicePickerOpen((value) => !value)}
              disabled={isLoading || devices.length === 0}
              aria-haspopup="listbox"
              aria-expanded={devicePickerOpen}
              aria-label="Select device"
              data-tour="device-list"
            >
              {selectedDevice ? (
                <>
                  <DeviceIcon
                    device={selectedDevice}
                    iconKey={getEffectiveIconKey(selectedDevice)}
                    size={14}
                    showBadge={false}
                    className="controls__device-picker-icon"
                    title={getDeviceIconDefinition(getEffectiveIconKey(selectedDevice)).label}
                  />
                  <span className="controls__device-picker-label">
                    {buildDeviceIdentityLabel(selectedDevice)}
                  </span>
                </>
              ) : (
                <span className="controls__device-picker-placeholder">
                  {isLoading ? 'Loading devices...' : 'Select a device'}
                </span>
              )}
            </button>
            {devicePickerOpen && devices.length > 0 ? (
              <div
                className="controls__device-picker-list"
                role="listbox"
                aria-label="Device options"
                data-tour="device-list"
              >
                {devices.map((device) => {
                  const optionIconKey = getEffectiveIconKey(device);
                  const optionIcon = getDeviceIconDefinition(optionIconKey);
                  return (
                    <button
                      key={device.id}
                      type="button"
                      role="option"
                      aria-selected={device.id === deviceId}
                      className={`controls__device-picker-option ${
                        device.id === deviceId ? 'is-active' : ''
                      }`}
                      onClick={() => {
                        onDeviceChange(device.id);
                        setDevicePickerOpen(false);
                      }}
                    >
                      <DeviceIcon
                        device={device}
                        iconKey={optionIconKey}
                        size={14}
                        showBadge={false}
                        className="controls__device-picker-icon"
                        title={optionIcon.label}
                      />
                      <span className="controls__device-picker-label">{buildDeviceIdentityLabel(device)}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {showDeviceTab && deviceId ? (
        <div className="controls__group device-details" data-tour="device-details">
          <button
            type="button"
            className="device-details__toggle"
            onClick={() => setDetailsExpanded((value) => !value)}
            aria-expanded={detailsExpanded}
            aria-controls="device-details-panel"
          >
            <span>Details</span>
            <span>{detailsExpanded ? '-' : '+'}</span>
          </button>
          {detailsExpanded ? (
            <div id="device-details-panel" className="device-details__body">
              {deviceDetailErrorStatus === 401 || deviceDetailErrorStatus === 403 ? (
                <div className="device-details__empty">Device details require QUERY key.</div>
              ) : deviceDetailQuery.isLoading ? (
                <div className="device-details__empty">Loading details...</div>
              ) : deviceDetail ? (
                <>
                  <div className="device-details__row">
                    <span>Name</span>
                    {hasQueryApiKey ? (
                      <div className="device-details__name-edit">
                        <input
                          type="text"
                          value={detailsNameDraft}
                          onChange={(event) => setDetailsNameDraft(event.target.value)}
                          aria-label="Device name"
                          disabled={updateDeviceMutation.isPending}
                        />
                        <button
                          type="button"
                          onClick={handleSaveDetailsName}
                          disabled={!detailsNameDirty || updateDeviceMutation.isPending}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <strong>{deviceDetail.name?.trim() || '—'}</strong>
                    )}
                  </div>
                  <div className="device-details__row">
                    <span>deviceUid</span>
                    <strong title={buildDeviceIdentityLabel(deviceDetail)} className="device-details__identity">
                      <DeviceOnlineDot
                        latestMeasurementAt={latest?.latestMeasurementAt ?? null}
                        latestWebhookReceivedAt={latest?.latestWebhookReceivedAt ?? null}
                        latestWebhookSource={latest?.latestWebhookSource ?? null}
                        formatRelativeTime={formatRelativeTime}
                        className="device-details__online-dot"
                        dataTour="device-online-dot"
                      />
                      <DeviceIcon
                        device={deviceDetail}
                        iconKey={detailIconKey}
                        size={15}
                        showBadge={false}
                        className="device-details__identity-icon"
                        title={detailIcon.label}
                      />
                      <span>{deviceDetail.deviceUid}</span>
                    </strong>
                  </div>
                  <div className="device-details__row">
                    <span>Icon</span>
                    <div className="device-details__icon">
                      {iconPickerOpen && iconCanEdit ? (
                        <div
                          ref={iconPickerRef}
                          className="device-details__icon-picker"
                          role="listbox"
                          aria-label="Select device icon"
                        >
                          {DEVICE_ICON_PICKER_OPTIONS.map((icon) => (
                            <button
                              key={icon.key}
                              type="button"
                              role="option"
                              aria-selected={icon.key === currentIconPickerValue}
                              className={`device-details__icon-option ${
                                icon.key === currentIconPickerValue ? 'is-active' : ''
                              }`}
                              onClick={() => handleSelectIcon(icon.key)}
                            >
                              <DeviceIcon
                                device={detailIconInput}
                                iconKey={icon.key}
                                size={14}
                                showBadge={false}
                                className="device-details__identity-icon"
                                title={icon.label}
                              />
                              <span>{icon.label}</span>
                            </button>
                          ))}
                        </div>
                      ) : iconCanEdit ? (
                        <button
                          type="button"
                          className="device-details__icon-display device-details__icon-display--editable"
                          onClick={handleOpenIconPicker}
                          aria-label="Edit device icon"
                          title="Click to change icon"
                        >
                          <DeviceIcon
                            device={detailIconInput}
                            iconKey={detailIconKey}
                            size={15}
                            showBadge={false}
                            className="device-details__identity-icon"
                            title={detailIcon.label}
                          />
                          <span>{detailIcon.label}</span>
                        </button>
                      ) : (
                        <strong className="device-details__identity" title={detailIcon.label}>
                          <DeviceIcon
                            device={detailIconInput}
                            iconKey={detailIconKey}
                            size={15}
                            showBadge={false}
                            className="device-details__identity-icon"
                            title={detailIcon.label}
                          />
                          <span>{detailIcon.label}</span>
                        </strong>
                      )}
                    </div>
                  </div>
                  <div className="device-details__row">
                    <span>Last seen</span>
                    <strong>{deviceDetail.lastSeenAt ? formatRelativeTime(deviceDetail.lastSeenAt) : '—'}</strong>
                  </div>
                  <div className="device-details__row">
                    <span>Status</span>
                    <div className="device-details__status">
                      <strong
                        className={`device-details__status-value device-details__status-value--${measurementStatus}`}
                      >
                        {measurementStatusLabel}
                      </strong>
                      <span className="device-details__status-meta">
                        Measurements: {measurementStatusLabel} (
                        {latestMeasurementTimestamp ? formatRelativeTime(latestMeasurementTimestamp) : 'never'})
                      </span>
                      <span className="device-details__status-meta">
                        Ingest ({latestWebhookSourceLabel}): {webhookStatusLabel} (
                        {latestWebhookTimestamp ? formatRelativeTime(latestWebhookTimestamp) : 'never'})
                      </span>
                    </div>
                  </div>
                  <div className="device-details__row">
                    <span>Created</span>
                    <strong>{formatRelativeTime(deviceDetail.createdAt)}</strong>
                  </div>
                  <div className="device-details__row">
                    <span>Archived</span>
                    <strong>{deviceDetail.isArchived ? 'yes' : 'no'}</strong>
                  </div>
                  <div className="device-details__row device-details__row--notes">
                    <span>Notes</span>
                    <div className="device-details__notes">
                      <strong>{notesPreview}</strong>
                      {hasQueryApiKey ? (
                        <button
                          type="button"
                          onClick={() => setNotesModalOpen(true)}
                          aria-label="Edit notes"
                        >
                          Edit
                        </button>
                      ) : null}
                    </div>
                  </div>

                  {hasMeshtasticSection ? (
                    <>
                      <div className="device-details__section-title">Meshtastic</div>
                      {meshtasticHwModel ? (
                        <div className="device-details__model">
                          <span>Device type</span>
                          <strong>{meshtasticHwModel}</strong>
                        </div>
                      ) : null}
                      {meshtasticLongName ? (
                        <div className="device-details__row">
                          <span>longName</span>
                          <strong>{meshtasticLongName}</strong>
                        </div>
                      ) : null}
                      {meshtasticShortName ? (
                        <div className="device-details__row">
                          <span>shortName</span>
                          <strong>{meshtasticShortName}</strong>
                        </div>
                      ) : null}
                      {meshtasticFirmwareVersion ? (
                        <div className="device-details__row">
                          <span>firmwareVersion</span>
                          <strong>{meshtasticFirmwareVersion}</strong>
                        </div>
                      ) : null}
                      {meshtasticAppVersion ? (
                        <div className="device-details__row">
                          <span>appVersion</span>
                          <strong>{meshtasticAppVersion}</strong>
                        </div>
                      ) : null}
                      {meshtasticRole ? (
                        <div className="device-details__row">
                          <span>role</span>
                          <strong>{meshtasticRole}</strong>
                        </div>
                      ) : null}
                      {meshtasticLastNodeInfoAt ? (
                        <div className="device-details__row">
                          <span>lastNodeInfoAt</span>
                          <strong>{formatRelativeTime(meshtasticLastNodeInfoAt)}</strong>
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  <div className="device-details__section-title">Latest location</div>
                  <div className="device-details__row">
                    <span>capturedAt</span>
                    <strong>
                      {latestLocation?.capturedAt ? formatRelativeTime(latestLocation.capturedAt) : '—'}
                    </strong>
                  </div>
                  <div className="device-details__row">
                    <span>lat/lon</span>
                    <strong>
                      {latestLocation
                        ? `${latestLocation.lat.toFixed(6)}, ${latestLocation.lon.toFixed(6)}`
                        : '—'}
                    </strong>
                  </div>
                  {latestLocation?.rssi !== null && latestLocation?.rssi !== undefined ? (
                    <div className="device-details__row">
                      <span>rssi</span>
                      <strong>{latestLocation.rssi}</strong>
                    </div>
                  ) : null}
                  {latestLocation?.snr !== null && latestLocation?.snr !== undefined ? (
                    <div className="device-details__row">
                      <span>snr</span>
                      <strong>{latestLocation.snr}</strong>
                    </div>
                  ) : null}
                  {latestLocation?.gatewayId ? (
                    <div className="device-details__row">
                      <span>gatewayId</span>
                      <strong>{latestLocation.gatewayId}</strong>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="controls__button"
                    onClick={() =>
                      latestLocation &&
                      onCenterOnLatestLocation([latestLocation.lat, latestLocation.lon])
                    }
                    disabled={!canCenterOnLatest}
                    data-tour="device-latest-location"
                  >
                    Center on latest
                  </button>
                  {detailsError ? (
                    <div className="device-details__error">{detailsError}</div>
                  ) : null}
                </>
              ) : (
                <div className="device-details__empty">No details found.</div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {showDeviceTab && deviceId && (
        <div className="controls__group" id="auto-session-section">
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

      {showDeviceTab && (
        <div className="controls__group" data-tour="device-latest-location">
          <span className="controls__label">Map</span>
          <label className="controls__toggle">
            <input
              type="checkbox"
              checked={showDeviceMarkers}
              onChange={(event) => onShowDeviceMarkersChange(event.target.checked)}
            />
            Show device markers
          </label>
        </div>
      )}

      {showDeviceTab && (
        <DevicesManager
          selectedDeviceId={deviceId}
          onSelectDevice={onDeviceChange}
          onOpenAutoSession={handleOpenAutoSessionShortcut}
        />
      )}

      {showSessionsTab && !isPlaybackMode && (
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
      )}

      {showPlaybackTab && (
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
          {isPlaybackMode && playbackControls}
        </div>
      )}

      {showCoverageTab && (
        <div className="controls__group">
          <span className="controls__label">Map layer</span>
          <div
            className="controls__segmented"
            role="radiogroup"
            aria-label="Map layer"
            data-tour="coverage-toggle"
          >
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
      )}

      {showCoverageTab && mapLayerMode === 'coverage' ? (
        <div className="controls__group" data-tour="coverage-metric">
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

      {showSessionsTab && isPlaybackMode ? (
        <div className="controls__group">
          <span className="controls__label">
            Playback mode is active. Use Playback tab controls for replay.
          </span>
        </div>
      ) : showSessionsTab && filterMode === 'time' ? (
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
      ) : showSessionsTab ? (
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
      ) : null}

      {showCoverageTab && (
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
      )}

      {showCoverageTab && (
        <div className="controls__group" data-tour="gateway-receiver-compare">
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
      )}

      {showCoverageTab && (
        <div className="controls__group">
          <span className="controls__label">Map</span>
          <button
            type="button"
            className="controls__button"
            onClick={onFitToData}
            title="Recenter map to visible data"
            aria-label="Recenter map to visible data"
            data-tour="fit-to-data"
          >
            Fit to data
          </button>
          {fitFeedback ? (
            <div className="controls__fit-feedback" role="status" aria-live="polite">
              {fitFeedback}
            </div>
          ) : null}
        </div>
      )}

      {showCoverageTab && (
        <div className="controls__group">
          <span className="controls__label">Layers</span>
          {mapLayerMode === 'points' && (
            <label className="controls__toggle">
              <input
                type="checkbox"
                checked={showPoints}
                onChange={(event) => onShowPointsChange(event.target.checked)}
              />
              Show points
            </label>
          )}
          <label className="controls__toggle">
            <input
              type="checkbox"
              checked={showTrack}
              onChange={(event) => onShowTrackChange(event.target.checked)}
            />
            Show track
          </label>
        </div>
      )}

      {showDebugTab ? (
        <>
          {debugAuthError ? (
            <div className="controls__debug-message">Debug requires QUERY key</div>
          ) : (
            <>
              <div data-tour="debug-events">
                <LorawanEventsPanel deviceUid={selectedDevice?.deviceUid} />
                <MeshtasticEventsPanel deviceUid={selectedDevice?.deviceUid} />
              </div>
              <div data-tour="debug-gateways">
                {receiverSource === 'lorawan' ? (
                  <GatewayStatsPanel
                    gatewayId={selectedGatewayId}
                    scope={gatewayScope}
                    enabled={gatewayScopeEnabled && Boolean(selectedGatewayId)}
                  />
                ) : (
                  <ReceiverStatsPanel
                    receiverId={selectedReceiverId}
                    count={selectedReceiver?.count ?? null}
                    lastSeenAt={selectedReceiver?.lastSeenAt ?? null}
                  />
                )}
              </div>
            </>
          )}
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
        </>
      ) : null}
      {notesModalOpen && deviceDetail && hasQueryApiKey ? (
        <div
          className="device-details__modal-backdrop"
          role="presentation"
          onClick={() => setNotesModalOpen(false)}
        >
          <div
            className="device-details__modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="device-notes-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="device-notes-modal-title">Edit notes</h3>
            <div className="device-details__modal-meta">{deviceDetail.deviceUid}</div>
            <label htmlFor="device-notes-modal-input">Notes</label>
            <textarea
              id="device-notes-modal-input"
              value={notesDraft}
              onChange={(event) => setNotesDraft(event.target.value)}
              rows={6}
            />
            <div className="device-details__modal-actions">
              <button
                type="button"
                onClick={() => setNotesModalOpen(false)}
                disabled={updateDeviceMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={updateDeviceMutation.isPending}
              >
                {updateDeviceMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function getApiBaseUrl(): string {
  const raw = (import.meta.env.VITE_API_BASE_URL ?? '').trim().replace(/\/$/, '');
  return raw;
}

function isDeviceIconPickerValue(value: string): value is DeviceIconKey {
  return DEVICE_ICON_PICKER_OPTIONS.some((icon) => icon.key === value);
}

function sanitizeIconPickerValue(
  value: string,
  fallback: DeviceIconKey
): DeviceIconKey {
  return isDeviceIconPickerValue(value) ? value : fallback;
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

function formatDeviceStatusBucket(status: DeviceStatusBucket): 'Online' | 'Recent' | 'Stale' | 'Offline' | 'Unknown' {
  if (status === 'online') {
    return 'Online';
  }
  if (status === 'recent') {
    return 'Recent';
  }
  if (status === 'stale') {
    return 'Stale';
  }
  if (status === 'offline') {
    return 'Offline';
  }
  return 'Unknown';
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
    <div className="controls__legend" aria-label="Coverage legend" data-tour="coverage-legend">
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

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
