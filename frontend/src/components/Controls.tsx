import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconAntennaBars5,
  IconCircuitCapacitor,
  IconCpu,
  IconHomeSignal,
  IconMapPin,
  IconMapPinBolt
} from '@tabler/icons-react';
import type {
  AutoSessionConfig,
  DeviceLatest,
  Session,
  DeviceTelemetrySample,
  SessionStats,
  UnifiedEventListItem
} from '../api/types';
import { useApiDiagnosticsEntries } from '../api/diagnostics';
import { ApiError } from '../api/http';
import {
  useAgentDecisions,
  useAutoSession,
  useDeviceDetail,
  useDeviceTelemetry,
  useDevices,
  useGateways,
  useReceivers,
  useSystemStatus,
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
import SessionDetailsPanel from './SessionDetailsPanel';
import EventsExplorerPanel from './EventsExplorerPanel';
import DeviceIcon, {
  DEVICE_ICON_CATALOG,
  type DeviceIconKey,
  buildDeviceIdentityLabel,
  getDevicePrimaryLabel,
  getDeviceIconDefinition,
  getEffectiveIconKey
} from './DeviceIcon';
import DeviceOnlineDot from './DeviceOnlineDot';
import DevicesManager from './DevicesManager';
import CollapsedSummaryChips, { type CollapsedSummaryChipItem } from './CollapsedSummaryChips';
import type { EventsNavigationInput } from '../utils/eventsNavigation';
import MiniLineChart from './charts/MiniLineChart';
import {
  bucketClass,
  bucketLabel,
  type CoverageBucket
} from '../coverage/coverageBuckets';

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
  playbackSessionId: string | null;
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
  onFitMapToSession: (sessionId: string, bbox: SessionStats['bbox']) => void | Promise<void>;
  onCenterOnLatestLocation: (point: [number, number]) => void;
  mapLayerMode: 'points' | 'coverage';
  onMapLayerModeChange: (mode: 'points' | 'coverage') => void;
  coverageVisualizationMode: 'bins' | 'heatmap';
  onCoverageVisualizationModeChange: (mode: 'bins' | 'heatmap') => void;
  coverageScope: 'device' | 'session';
  onCoverageScopeChange: (scope: 'device' | 'session') => void;
  selectedCoverageSessionId: string | null;
  onSelectedCoverageSessionIdChange: (sessionId: string | null) => void;
  coverageSessionOptions: Session[];
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
  showCoverageTracks: boolean;
  showDeviceMarkers: boolean;
  showHomeGeofence: boolean;
  homeGeofenceConfigured: boolean;
  onShowHomeGeofenceChange: (value: boolean) => void;
  onShowDeviceMarkersChange: (value: boolean) => void;
  onShowPointsChange: (value: boolean) => void;
  onShowTrackChange: (value: boolean) => void;
  onShowCoverageTracksChange: (value: boolean) => void;
  playbackControls?: ReactNode;
  fitFeedback?: string | null;
  sessionSelectionNotice?: string | null;
  eventsNavigationNonce: number;
  eventsNavigationRequest: EventsNavigationInput | null;
  onOpenEvents: (input: EventsNavigationInput) => void;
  onSelectEventForMap: (event: UnifiedEventListItem) => void;
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
  playbackSessionId,
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
  onFitMapToSession,
  onCenterOnLatestLocation,
  mapLayerMode,
  onMapLayerModeChange,
  coverageVisualizationMode,
  onCoverageVisualizationModeChange,
  coverageScope,
  onCoverageScopeChange,
  selectedCoverageSessionId,
  onSelectedCoverageSessionIdChange,
  coverageSessionOptions,
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
  showCoverageTracks,
  showDeviceMarkers,
  showHomeGeofence,
  homeGeofenceConfigured,
  onShowHomeGeofenceChange,
  onShowDeviceMarkersChange,
  onShowPointsChange,
  onShowTrackChange,
  onShowCoverageTracksChange,
  playbackControls,
  fitFeedback,
  sessionSelectionNotice,
  eventsNavigationNonce,
  eventsNavigationRequest,
  onOpenEvents,
  onSelectEventForMap
}: ControlsProps) {
  const { data: devicesData, isLoading } = useDevices();
  const devices = devicesData?.items ?? [];
  const selectedDevice = devices.find((device) => device.id === deviceId) ?? null;
  const handleEventsDeviceFilterChange = useCallback((nextDeviceUid: string | null) => {
    if (!nextDeviceUid) {
      return;
    }
    const normalizedUid = nextDeviceUid.trim();
    if (!normalizedUid) {
      return;
    }
    const matchingDevice = devices.find((device) => device.deviceUid === normalizedUid);
    if (matchingDevice && matchingDevice.id !== deviceId) {
      onDeviceChange(matchingDevice.id);
    }
  }, [devices, deviceId, onDeviceChange]);
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
  const [autoSessionExpanded, setAutoSessionExpanded] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
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
  const telemetryQuery = useDeviceTelemetry(deviceId, 48);
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
  const mostRecentCoverageSession = coverageSessionOptions[0] ?? null;
  const effectiveCoverageSessionId = selectedCoverageSessionId ?? mostRecentCoverageSession?.id ?? null;
  const selectedReceiver =
    receiverOptions.find((receiver) => receiver.id === selectedReceiverId) ?? null;
  const debugProbeEnabled = showDebugTab && hasQueryApiKey;
  const diagnosticsEntries = useApiDiagnosticsEntries();
  const systemStatusQuery = useSystemStatus({
    enabled: showDebugTab && hasQueryApiKey,
    refetchInterval: showDebugTab && hasQueryApiKey ? 15_000 : false
  });
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
  const systemStatusErrorRequestId = getRequestIdFromError(systemStatusQuery.error);

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
  const meshtasticMacaddr = normalizeOptionalText(deviceDetail?.macaddr);
  const meshtasticLastNodeInfoAt = deviceDetail?.lastNodeInfoAt ?? null;
  const latestTelemetry = deviceDetail?.latestTelemetry ?? null;
  const telemetrySamples = telemetryQuery.data?.items ?? [];
  const telemetrySeries = useMemo(
    () => buildTelemetrySeries(telemetrySamples),
    [telemetrySamples]
  );
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
      meshtasticMacaddr ||
      meshtasticLastNodeInfoAt
  );
  const detailsNameDirty = (detailsNameDraft ?? '').trim() !== (deviceDetail?.name ?? '').trim();
  const notesPreviewRaw = deviceDetail?.notes ?? '';
  const notesPreview =
    notesPreviewRaw.length > 120 ? `${notesPreviewRaw.slice(0, 120)}...` : notesPreviewRaw || '—';
  const measurementStatusCompactLabel = measurementStatusLabel === 'Offline' ? 'Off' : measurementStatusLabel;
  const detailsStatusTone: CollapsedSummaryChipItem['tone'] =
    measurementStatus === 'online'
      ? 'success'
      : measurementStatus === 'recent'
        ? 'warn'
        : measurementStatus === 'stale' || measurementStatus === 'offline'
          ? 'danger'
          : 'neutral';
  const detailLastSeenValue = deviceDetail?.lastSeenAt ?? latestMeasurementTimestamp;
  const detailBatteryLevel =
    typeof latestTelemetry?.batteryLevel === 'number' && Number.isFinite(latestTelemetry.batteryLevel)
      ? Math.max(0, Math.round(latestTelemetry.batteryLevel))
      : null;
  const detailDeviceTypeLabel = toCompactDeviceTypeLabel(
    meshtasticHwModel ?? detailIcon.label ?? selectedDevice?.hwModel ?? null
  );
  const detailsCollapsedSummaryItems = useMemo<CollapsedSummaryChipItem[]>(() => {
    const items: CollapsedSummaryChipItem[] = [
      {
        key: 'status',
        priority: 1,
        icon: (
          <DeviceOnlineDot
            latestMeasurementAt={latestMeasurementTimestamp}
            latestWebhookReceivedAt={latestWebhookTimestamp}
            latestWebhookSource={latest?.latestWebhookSource ?? null}
            formatRelativeTime={formatRelativeTime}
          />
        ),
        text: measurementStatusCompactLabel,
        tone: detailsStatusTone,
        title: `Status: ${measurementStatusLabel}`
      },
      {
        key: 'last-seen',
        priority: 2,
        icon: <IconAntennaBars5 size={14} stroke={1.8} />,
        text: detailLastSeenValue ? formatRelativeTime(detailLastSeenValue) : 'Never',
        title: detailLastSeenValue ? `Last seen ${formatRelativeTime(detailLastSeenValue)}` : 'Last seen never'
      },
      {
        key: 'location',
        priority: 3,
        icon: <IconMapPin size={14} stroke={1.8} />,
        text: latestLocation ? formatLatLonCompact(latestLocation.lat, latestLocation.lon) : 'GPS—',
        title: latestLocation
          ? `Latest location ${latestLocation.lat.toFixed(6)}, ${latestLocation.lon.toFixed(6)}`
          : 'No GPS location yet'
      }
    ];

    if (detailBatteryLevel !== null) {
      items.push({
        key: 'battery',
        priority: 4,
        icon: <IconCircuitCapacitor size={14} stroke={1.8} />,
        text: `${detailBatteryLevel}%`,
        title: `Battery ${detailBatteryLevel}%`
      });
    }

    if (detailDeviceTypeLabel) {
      items.push({
        key: 'device-type',
        priority: 5,
        icon: <IconCpu size={14} stroke={1.8} />,
        text: detailDeviceTypeLabel,
        title: `Device type ${detailDeviceTypeLabel}`
      });
    }

    return items;
  }, [
    detailBatteryLevel,
    detailDeviceTypeLabel,
    detailLastSeenValue,
    detailsStatusTone,
    latest,
    latestLocation,
    latestMeasurementTimestamp,
    latestWebhookTimestamp,
    measurementStatusCompactLabel,
    measurementStatusLabel
  ]);

  const autoHomeLat = toFiniteNumber(autoSessionForm.homeLat);
  const autoHomeLon = toFiniteNumber(autoSessionForm.homeLon);
  const autoRadiusMeters = toFiniteNumber(autoSessionForm.radiusMeters);
  const autoHomeConfigured = autoHomeLat !== null && autoHomeLon !== null;
  const autoInsideOutsideText = useMemo(() => {
    if (!autoHomeConfigured || autoRadiusMeters === null || autoRadiusMeters <= 0 || !latestLocation) {
      return null;
    }
    const distanceMeters = getApproxDistanceMeters(
      autoHomeLat,
      autoHomeLon,
      latestLocation.lat,
      latestLocation.lon
    );
    if (!Number.isFinite(distanceMeters)) {
      return null;
    }
    return distanceMeters <= autoRadiusMeters ? 'Inside' : 'Outside';
  }, [autoHomeConfigured, autoHomeLat, autoHomeLon, autoRadiusMeters, latestLocation]);

  const autoSessionCollapsedSummaryItems = useMemo<CollapsedSummaryChipItem[]>(() => {
    const items: CollapsedSummaryChipItem[] = [
      {
        key: 'enabled',
        priority: 1,
        icon: <IconAntennaBars5 size={14} stroke={1.8} />,
        text: autoSessionForm.enabled ? 'On' : 'Off',
        tone: autoSessionForm.enabled ? 'success' : 'neutral',
        title: autoSessionForm.enabled ? 'Auto session enabled' : 'Auto session disabled'
      },
      {
        key: 'home',
        priority: 2,
        icon: <IconHomeSignal size={14} stroke={1.8} />,
        text: autoHomeConfigured ? 'Home set' : 'Home—',
        tone: autoHomeConfigured ? 'success' : 'warn',
        title: autoHomeConfigured
          ? `Home ${autoHomeLat?.toFixed(5)}, ${autoHomeLon?.toFixed(5)}`
          : 'Home location not configured'
      },
      {
        key: 'radius',
        priority: 3,
        icon: <IconMapPinBolt size={14} stroke={1.8} />,
        text: autoRadiusMeters !== null ? `${Math.max(0, Math.round(autoRadiusMeters))}m` : 'Radius—',
        title:
          autoRadiusMeters !== null
            ? `Radius ${Math.max(0, Math.round(autoRadiusMeters))} meters`
            : 'Radius not configured'
      }
    ];

    if (autoInsideOutsideText) {
      items.push({
        key: 'inside',
        priority: 4,
        icon: <IconMapPin size={14} stroke={1.8} />,
        text: autoInsideOutsideText,
        tone: autoInsideOutsideText === 'Inside' ? 'success' : 'warn',
        title: `Latest point is ${autoInsideOutsideText.toLowerCase()} home radius`
      });
    }

    items.push({
      key: 'overlay',
      priority: 5,
      icon: <IconMapPinBolt size={14} stroke={1.8} />,
      text: showHomeGeofence ? 'Map on' : 'Map off',
      tone: showHomeGeofence ? 'success' : 'neutral',
      title: showHomeGeofence ? 'Home geofence overlay shown on map' : 'Home geofence overlay hidden'
    });

    return items;
  }, [
    autoHomeConfigured,
    autoHomeLat,
    autoHomeLon,
    autoInsideOutsideText,
    autoRadiusMeters,
    autoSessionForm.enabled,
    showHomeGeofence
  ]);

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
    setAutoSessionExpanded(true);
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
                    {buildCompactDevicePickerLabel(selectedDevice)}
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
                      <span className="controls__device-picker-label">
                        {buildCompactDevicePickerLabel(device)}
                      </span>
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
            <span className="panel-toggle__content">
              <span className="panel-toggle__title">Details</span>
              {!detailsExpanded ? (
                <CollapsedSummaryChips items={detailsCollapsedSummaryItems} />
              ) : null}
            </span>
            <span className="device-details__toggle-meta">{detailsExpanded ? '-' : '+'}</span>
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
                    <span>Raw events</span>
                    <div className="device-details__events-links">
                      <button
                        type="button"
                        className="device-details__events-link"
                        onClick={() =>
                          onOpenEvents({
                            deviceUid: deviceDetail.deviceUid
                          })
                        }
                      >
                        View raw event(s)
                      </button>
                    </div>
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
                      {meshtasticMacaddr ? (
                        <div className="device-details__row">
                          <span>macaddr</span>
                          <strong>{meshtasticMacaddr}</strong>
                        </div>
                      ) : null}
                      {meshtasticLastNodeInfoAt ? (
                        <div className="device-details__row">
                          <span>lastNodeInfoAt</span>
                          <strong>{formatRelativeTime(meshtasticLastNodeInfoAt)}</strong>
                        </div>
                      ) : null}
                      <div className="device-details__row">
                        <span>Raw node info</span>
                        <div className="device-details__events-links">
                          <button
                            type="button"
                            className="device-details__events-link"
                            onClick={() =>
                              onOpenEvents({
                                deviceUid: deviceDetail.deviceUid,
                                source: 'meshtastic',
                                portnum: 'NODEINFO_APP'
                              })
                            }
                          >
                            View raw nodeinfo event
                          </button>
                        </div>
                      </div>
                    </>
                  ) : null}

                  {latestTelemetry ? (
                    <>
                      <div className="device-details__section-title">Latest telemetry</div>
                      <div className="device-details__row">
                        <span>batteryLevel</span>
                        <strong>{formatTelemetryMetric(latestTelemetry.batteryLevel, '%')}</strong>
                      </div>
                      <div className="device-details__row">
                        <span>voltage</span>
                        <strong>{formatTelemetryMetric(latestTelemetry.voltage, 'V')}</strong>
                      </div>
                      <div className="device-details__row">
                        <span>channelUtilization</span>
                        <strong>{formatTelemetryMetric(latestTelemetry.channelUtilization, '%')}</strong>
                      </div>
                      <div className="device-details__row">
                        <span>airUtilTx</span>
                        <strong>{formatTelemetryMetric(latestTelemetry.airUtilTx, '%')}</strong>
                      </div>
                      <div className="device-details__row">
                        <span>uptimeSeconds</span>
                        <strong>{formatTelemetrySeconds(latestTelemetry.uptimeSeconds)}</strong>
                      </div>
                      <div className="device-details__row">
                        <span>capturedAt</span>
                        <strong>{formatRelativeTime(latestTelemetry.capturedAt)}</strong>
                      </div>
                      {telemetrySeries ? (
                        <div className="device-details__row">
                          <span>trend</span>
                          <TelemetrySparkline series={telemetrySeries} />
                        </div>
                      ) : null}
                      <div className="device-details__row">
                        <span>Raw telemetry</span>
                        <div className="device-details__events-links">
                          <button
                            type="button"
                            className="device-details__events-link"
                            onClick={() =>
                              onOpenEvents({
                                deviceUid: deviceDetail.deviceUid,
                                source: 'meshtastic',
                                portnum: 'TELEMETRY_APP'
                              })
                            }
                          >
                            View raw telemetry event
                          </button>
                        </div>
                      </div>
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
        <div className="controls__group auto-session-panel" id="auto-session-section">
          <button
            type="button"
            className="auto-session-panel__toggle"
            onClick={() => setAutoSessionExpanded((value) => !value)}
            aria-expanded={autoSessionExpanded}
            aria-controls="auto-session-panel-body"
          >
            <span className="panel-toggle__content">
              <span className="panel-toggle__title">Auto Session (Home Geofence)</span>
              {!autoSessionExpanded ? (
                <CollapsedSummaryChips items={autoSessionCollapsedSummaryItems} />
              ) : null}
            </span>
            <span className="auto-session-panel__toggle-meta">{autoSessionExpanded ? '-' : '+'}</span>
          </button>
          {autoSessionExpanded ? (
            <div id="auto-session-panel-body" className="auto-session-panel__body">
              <label className="controls__toggle">
                <input
                  type="checkbox"
                  checked={autoSessionForm.enabled}
                  onChange={(event) => updateAutoSessionField('enabled', event.target.checked)}
                />
                Enabled
              </label>
              <div className="controls__row minw0">
                <div className="controls__group minw0 flex1">
                  <label htmlFor="auto-home-lat">homeLat</label>
                  <input
                    id="auto-home-lat"
                    type="number"
                    value={autoSessionForm.homeLat}
                    onChange={(event) => updateAutoSessionField('homeLat', event.target.value)}
                  />
                </div>
                <div className="controls__group minw0 flex1">
                  <label htmlFor="auto-home-lon">homeLon</label>
                  <input
                    id="auto-home-lon"
                    type="number"
                    value={autoSessionForm.homeLon}
                    onChange={(event) => updateAutoSessionField('homeLon', event.target.value)}
                  />
                </div>
              </div>
              <div className="controls__row minw0">
                <div className="controls__group minw0 flex1">
                  <label htmlFor="auto-radius">radiusMeters</label>
                  <input
                    id="auto-radius"
                    type="number"
                    value={autoSessionForm.radiusMeters}
                    onChange={(event) => updateAutoSessionField('radiusMeters', event.target.value)}
                  />
                </div>
                <div className="controls__group minw0 flex1">
                  <label htmlFor="auto-min-outside">minOutsideSeconds</label>
                  <input
                    id="auto-min-outside"
                    type="number"
                    value={autoSessionForm.minOutsideSeconds}
                    onChange={(event) => updateAutoSessionField('minOutsideSeconds', event.target.value)}
                  />
                </div>
              </div>
              <div className="controls__row minw0">
                <div className="controls__group minw0 flex1">
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
              <label
                className="controls__toggle"
                title={homeGeofenceConfigured ? 'Show home geofence on map' : 'Home geofence not configured'}
              >
                <input
                  type="checkbox"
                  checked={homeGeofenceConfigured ? showHomeGeofence : false}
                  onChange={(event) => onShowHomeGeofenceChange(event.target.checked)}
                  disabled={!homeGeofenceConfigured}
                />
                Show Home Geofence
              </label>
              {autoSessionAuthError ? (
                <div className="controls__gateway-error">
                  Auto session requires QUERY key
                </div>
              ) : null}
              {autoSessionError ? (
                <div className="controls__gateway-error">{autoSessionError}</div>
              ) : null}
            </div>
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
          {isPlaybackMode && playbackSessionId ? (
            <SessionDetailsPanel
              sessionId={playbackSessionId}
              onFitMapToSession={onFitMapToSession}
            />
          ) : null}
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
          <span className="controls__label">Coverage</span>
          <span className="controls__sub-label">Scope</span>
          <div className="controls__segmented" role="radiogroup" aria-label="Coverage scope">
            <label
              className={`controls__segment ${coverageScope === 'device' ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="coverage-scope"
                value="device"
                checked={coverageScope === 'device'}
                onChange={() => {
                  onCoverageScopeChange('device');
                  onSelectedCoverageSessionIdChange(null);
                }}
              />
              Device
            </label>
            <label
              className={`controls__segment ${coverageScope === 'session' ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="coverage-scope"
                value="session"
                checked={coverageScope === 'session'}
                onChange={() => {
                  onCoverageScopeChange('session');
                  onSelectedCoverageSessionIdChange(
                    selectedCoverageSessionId ?? mostRecentCoverageSession?.id ?? null
                  );
                }}
              />
              Session
            </label>
          </div>
          {coverageScope === 'session' ? (
            <>
              <label htmlFor="coverage-session-select">Session</label>
              <select
                id="coverage-session-select"
                value={effectiveCoverageSessionId ?? ''}
                onChange={(event) => {
                  const nextId = event.target.value || null;
                  onCoverageScopeChange('session');
                  onSelectedCoverageSessionIdChange(nextId);
                }}
                disabled={coverageSessionOptions.length === 0}
              >
                {coverageSessionOptions.length === 0 ? (
                  <option value="">No sessions available</option>
                ) : null}
                {coverageSessionOptions.map((session) => (
                  <option key={`coverage-session-${session.id}`} value={session.id}>
                    {formatCoverageSessionOption(session)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="controls__inline-link"
                onClick={() => {
                  onCoverageScopeChange('device');
                  onSelectedCoverageSessionIdChange(null);
                }}
              >
                Back to all sessions
              </button>
            </>
          ) : null}
          <span className="controls__sub-label">Visualization</span>
          <div className="controls__segmented" role="radiogroup" aria-label="Coverage visualization">
            <label
              className={`controls__segment ${coverageVisualizationMode === 'bins' ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="coverage-visualization"
                value="bins"
                checked={coverageVisualizationMode === 'bins'}
                onChange={() => onCoverageVisualizationModeChange('bins')}
              />
              Bins
            </label>
            <label
              className={`controls__segment ${coverageVisualizationMode === 'heatmap' ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="coverage-visualization"
                value="heatmap"
                checked={coverageVisualizationMode === 'heatmap'}
                onChange={() => onCoverageVisualizationModeChange('heatmap')}
              />
              Heatmap
            </label>
          </div>
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
          {playbackSessionId ? (
            <SessionDetailsPanel
              sessionId={playbackSessionId}
              onFitMapToSession={onFitMapToSession}
            />
          ) : null}
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
              {filterMode === 'session' && !selectedSessionId ? (
                <div className="controls__session-empty-state" role="status" aria-live="polite">
                  Select a session
                </div>
              ) : null}
              {selectedSessionId ? (
                <SessionDetailsPanel
                  sessionId={selectedSessionId}
                  onFitMapToSession={onFitMapToSession}
                />
              ) : null}
              <SessionsPanel
                deviceId={deviceId}
                selectedSessionId={selectedSessionId}
                onSelectSessionId={onSelectSessionId}
                onStartSession={onStartSession}
              />
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
            <>
              <label className="controls__toggle">
                <input
                  type="checkbox"
                  checked={showPoints}
                  onChange={(event) => onShowPointsChange(event.target.checked)}
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
            </>
          )}
          {mapLayerMode === 'coverage' ? (
            <label className="controls__toggle">
              <input
                type="checkbox"
                checked={showCoverageTracks}
                onChange={(event) => onShowCoverageTracksChange(event.target.checked)}
              />
              Show tracks
            </label>
          ) : null}
        </div>
      )}

      {showDebugTab ? (
        <>
          <EventsExplorerPanel
            isActive={showDebugTab}
            hasQueryApiKey={hasQueryApiKey}
            navigationNonce={eventsNavigationNonce}
            navigationRequest={eventsNavigationRequest}
            onSelectEventForMap={onSelectEventForMap}
            onDeviceFilterChange={handleEventsDeviceFilterChange}
          />
          <div className="controls__group controls__system-status-panel">
            <span className="controls__label">System status</span>
            {!hasQueryApiKey ? (
              <div className="controls__debug-message">
                System status requires QUERY key
              </div>
            ) : systemStatusQuery.isLoading ? (
              <div className="controls__status">Loading status…</div>
            ) : systemStatusQuery.error ? (
              <div className="controls__status">
                <div className="controls__status-row controls__status-error">
                  <span>Status call failed:</span>
                  <strong>{systemStatusQuery.error.message}</strong>
                </div>
                {systemStatusErrorRequestId ? (
                  <div className="controls__status-row">
                    <span>X-Request-Id:</span>
                    <strong>{systemStatusErrorRequestId}</strong>
                  </div>
                ) : null}
              </div>
            ) : systemStatusQuery.data ? (
              <div className="controls__status">
                <div className="controls__status-row">
                  <span>App version:</span>
                  <strong>{systemStatusQuery.data.version || 'unknown'}</strong>
                </div>
                <div className="controls__status-row">
                  <span>Backend time:</span>
                  <strong>{formatRelativeTime(systemStatusQuery.data.now)}</strong>
                </div>
                <div className="controls__status-row">
                  <span>DB:</span>
                  <strong>
                    {systemStatusQuery.data.db.ok ? 'ok' : 'error'}
                    {systemStatusQuery.data.db.ok &&
                    typeof systemStatusQuery.data.db.latencyMs === 'number'
                      ? ` (${systemStatusQuery.data.db.latencyMs.toFixed(2)}ms)`
                      : ''}
                  </strong>
                </div>
                <div className="controls__status-row">
                  <span>Worker webhook:</span>
                  <strong>
                    {systemStatusQuery.data.workers.webhookProcessor.lastRunAt
                      ? formatRelativeTime(systemStatusQuery.data.workers.webhookProcessor.lastRunAt)
                      : 'never'}
                    {systemStatusQuery.data.workers.webhookProcessor.lastError
                      ? ` (${systemStatusQuery.data.workers.webhookProcessor.lastError})`
                      : ''}
                  </strong>
                </div>
                <div className="controls__status-row">
                  <span>Worker retention:</span>
                  <strong>
                    {systemStatusQuery.data.workers.retention.lastRunAt
                      ? formatRelativeTime(systemStatusQuery.data.workers.retention.lastRunAt)
                      : 'never'}
                    {systemStatusQuery.data.workers.retention.lastError
                      ? ` (${systemStatusQuery.data.workers.retention.lastError})`
                      : ''}
                  </strong>
                </div>
                <div
                  className={`controls__status-row ${
                    systemStatusQuery.data.ingest.latestWebhookError
                      ? 'controls__status-error'
                      : ''
                  }`}
                >
                  <span>Latest webhook:</span>
                  <strong>
                    {systemStatusQuery.data.ingest.latestWebhookReceivedAt
                      ? formatRelativeTime(systemStatusQuery.data.ingest.latestWebhookReceivedAt)
                      : '—'}
                    {systemStatusQuery.data.ingest.latestWebhookError
                      ? ` (${systemStatusQuery.data.ingest.latestWebhookError})`
                      : ''}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="controls__status">No status available.</div>
            )}
            <details className="controls__status-details">
              <summary>
                Recent API calls
                <span className="controls__status-details-count">{diagnosticsEntries.length}</span>
              </summary>
              <div className="controls__status-details-list">
                {diagnosticsEntries.length === 0 ? (
                  <div className="controls__status-details-empty">No recent calls.</div>
                ) : (
                  diagnosticsEntries.map((entry) => (
                    <div key={entry.id} className="controls__status-details-row">
                      <div className="controls__status-details-main">
                        <strong>{entry.statusCode}</strong>
                        <span>{entry.endpointPath}</span>
                      </div>
                      <div className="controls__status-details-meta">
                        <span>{formatRelativeTime(entry.timestamp)}</span>
                        {entry.requestId ? <span>id: {entry.requestId}</span> : null}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </details>
          </div>
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

function isDeviceIconPickerValue(value: string): value is DeviceIconKey {
  return DEVICE_ICON_PICKER_OPTIONS.some((icon) => icon.key === value);
}

function sanitizeIconPickerValue(
  value: string,
  fallback: DeviceIconKey
): DeviceIconKey {
  return isDeviceIconPickerValue(value) ? value : fallback;
}

function formatCoverageSessionOption(session: Session): string {
  const name = session.name?.trim();
  const label = name && name.length > 0 ? name : `Session ${session.id.slice(0, 8)}`;
  const startedAt = new Date(session.startedAt);
  const startedLabel = Number.isNaN(startedAt.getTime())
    ? session.startedAt
    : startedAt.toLocaleString();
  return `${label} (${startedLabel})`;
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

function formatTelemetryMetric(value: number | null | undefined, unit: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  const decimals = Math.abs(value) >= 100 ? 0 : 2;
  const formatted = Number(value.toFixed(decimals)).toString();
  return `${formatted}${unit ? ` ${unit}` : ''}`;
}

function formatTelemetrySeconds(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.max(0, Math.round(value))}s`;
}

function toFiniteNumber(value: string | number | null | undefined): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatLatLonCompact(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return 'GPS—';
  }
  return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
}

function toCompactDeviceTypeLabel(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/[_\s]+/g, ' ').trim();
  if (!normalized) {
    return null;
  }
  return normalized.length > 16 ? `${normalized.slice(0, 16)}…` : normalized;
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

type TelemetrySeries = {
  metric: 'batteryLevel' | 'voltage';
  label: string;
  unit: string;
  values: number[];
  min: number;
  max: number;
  latest: number;
};

function buildTelemetrySeries(samples: DeviceTelemetrySample[]): TelemetrySeries | null {
  if (samples.length === 0) {
    return null;
  }

  const batteryValues = samples
    .map((sample) => sample.batteryLevel)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (batteryValues.length >= 2) {
    return createTelemetrySeries('batteryLevel', 'Battery', '%', batteryValues);
  }

  const voltageValues = samples
    .map((sample) => sample.voltage)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (voltageValues.length >= 2) {
    return createTelemetrySeries('voltage', 'Voltage', 'V', voltageValues);
  }

  return null;
}

function createTelemetrySeries(
  metric: TelemetrySeries['metric'],
  label: string,
  unit: string,
  values: number[]
): TelemetrySeries | null {
  if (values.length < 2) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const latest = values[values.length - 1];
  return {
    metric,
    label,
    unit,
    values,
    min,
    max,
    latest
  };
}

function TelemetrySparkline({ series }: { series: TelemetrySeries }) {
  return (
    <div className="device-details__sparkline">
      <MiniLineChart
        className="device-details__sparkline-chart"
        data={series.values}
        getValue={(value) => value}
        aria-label={`${series.label} trend`}
      />
      <div className="device-details__sparkline-meta">
        <span>{series.label}</span>
        <strong>{formatTelemetryMetric(series.latest, series.unit)}</strong>
      </div>
    </div>
  );
}

function CoverageLegend({ metric }: { metric: 'count' | 'rssiAvg' | 'snrAvg' }) {
  const items: CoverageBucket[] = ['low', 'med', 'high'];

  return (
    <div className="controls__legend" aria-label="Coverage legend" data-tour="coverage-legend">
      {items.map((bucket) => (
        <div key={bucket} className="controls__legend-row">
          <span className={`controls__legend-swatch coverage-bin ${bucketClass(metric, bucket)}`} />
          <span>{bucketLabel(metric, bucket)}</span>
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

function getRequestIdFromError(error: unknown): string | null {
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

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildCompactDevicePickerLabel(device: {
  deviceUid?: string | null;
  name?: string | null;
  longName?: string | null;
  shortName?: string | null;
}): string {
  const primary = getDevicePrimaryLabel(device);
  const uid = typeof device.deviceUid === 'string' ? device.deviceUid.trim() : '';
  if (!uid || uid.toLowerCase() === primary.toLowerCase()) {
    return primary;
  }
  return `${primary} (${uid})`;
}
