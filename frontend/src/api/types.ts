export type Device = {
  id: string;
  deviceUid: string;
  name: string | null;
  longName: string | null;
  hwModel: string | null;
  iconKey: string | null;
  iconOverride: boolean;
  notes?: string | null;
  isArchived: boolean;
  lastSeenAt: string | null;
  latestMeasurementAt: string | null;
};

export type DeviceMutable = {
  id: string;
  deviceUid: string;
  name: string | null;
  notes: string | null;
  iconKey: string | null;
  iconOverride: boolean;
  isArchived: boolean;
  lastSeenAt: string | null;
};

export type DeviceDetail = {
  id: string;
  deviceUid: string;
  name: string | null;
  notes: string | null;
  iconKey: string | null;
  iconOverride: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string | null;
  longName: string | null;
  shortName: string | null;
  hwModel: string | null;
  firmwareVersion: string | null;
  appVersion: string | null;
  role: string | null;
  lastNodeInfoAt: string | null;
  latestMeasurement: {
    capturedAt: string;
    lat: number;
    lon: number;
    rssi: number | null;
    snr: number | null;
    gatewayId: string | null;
  } | null;
};

export type ListResponse<T> = {
  items: T[];
  count: number;
};

export type Measurement = {
  id: string;
  deviceId: string;
  sessionId: string | null;
  capturedAt: string;
  lat: number;
  lon: number;
  alt: number | null;
  rssi: number | null;
  snr: number | null;
  sf: number | null;
  bw: number | null;
  freq: number | null;
  gatewayId: string | null;
};

export type Session = {
  id: string;
  deviceId: string;
  name?: string | null;
  startedAt: string;
  endedAt?: string | null;
  notes?: string | null;
  isArchived: boolean;
};

export type SessionDetail = {
  id: string;
  deviceId: string;
  ownerId: string | null;
  name: string | null;
  startedAt: string;
  endedAt: string | null;
  notes: string | null;
  isArchived: boolean;
  archivedAt: string | null;
  updatedAt: string;
  measurementCount: number;
};

export type SessionTimeline = {
  sessionId: string;
  deviceId: string;
  startedAt: string;
  endedAt: string | null;
  minCapturedAt: string | null;
  maxCapturedAt: string | null;
  count: number;
};

export type SessionWindowPoint = {
  id: string;
  capturedAt: string;
  lat: number;
  lon: number;
  rssi: number | null;
  snr: number | null;
  sf: number | null;
  bw: number | null;
  freq: number | null;
  gatewayId: string | null;
};

export type SessionWindowResponse = {
  sessionId: string;
  cursor: string;
  from: string;
  to: string;
  totalBeforeSample: number;
  returnedAfterSample: number;
  items: SessionWindowPoint[];
};

export type TrackPoint = {
  capturedAt: string;
  lat: number;
  lon: number;
};

export type CoverageBin = {
  latBin: number;
  lonBin: number;
  count: number;
  rssiAvg: number | null;
  snrAvg: number | null;
  rssiMin: number | null;
  rssiMax: number | null;
  snrMin: number | null;
  snrMax: number | null;
  gatewayId: string | null;
};

export type CoverageBinsResponse = {
  binSizeDeg: number;
  day: string;
  items: CoverageBin[];
  count: number;
};

export type GatewaySummary = {
  gatewayId: string;
  count: number;
  lastSeenAt: string | null;
};

export type ReceiverSummary = {
  id: string;
  source: 'lorawan' | 'meshtastic';
  count: number;
  lastSeenAt: string | null;
};

export type GatewayStats = {
  gatewayId: string;
  count: number;
  rssi: {
    min: number | null;
    max: number | null;
    avg: number | null;
  };
  snr: {
    min: number | null;
    max: number | null;
    avg: number | null;
  };
  lastSeenAt: string | null;
};

export type DeviceLatest = {
  latestMeasurementAt: string | null;
  latestWebhookReceivedAt: string | null;
  latestWebhookError: string | null;
  latestWebhookSource: string | null;
};

export type AutoSessionConfig = {
  enabled: boolean;
  homeLat: number | null;
  homeLon: number | null;
  radiusMeters: number | null;
  minOutsideSeconds: number | null;
  minInsideSeconds: number | null;
};

export type AgentDecision = {
  id: string;
  deviceId: string;
  deviceUid: string;
  decision: string;
  reason: string | null;
  inside: boolean | null;
  distanceM: number | null;
  capturedAt: string | null;
  createdAt: string;
};

export type LorawanEvent = {
  id: string;
  receivedAt: string;
  processedAt: string | null;
  deviceUid: string | null;
  processingError: string | null;
  uplinkId: string | null;
};

export type LorawanEventDetail = LorawanEvent & {
  payload: unknown;
};

export type MeshtasticEvent = {
  id: string;
  receivedAt: string;
  processedAt: string | null;
  deviceUid: string | null;
  processingError: string | null;
  uplinkId: string | null;
};

export type MeshtasticEventDetail = MeshtasticEvent & {
  payload: unknown;
};

export type LorawanSummary = {
  totalEvents: number;
  processedEvents: number;
  unprocessedEvents: number;
  errorsByType: Array<{
    processingError: string;
    count: number;
  }>;
  lastEventReceivedAt: string | null;
  lastMeasurementCreatedAt: string | null;
};
