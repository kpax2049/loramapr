export type Device = {
  id: string;
  deviceUid: string;
  name: string | null;
  lastSeenAt: string | null;
  latestMeasurementAt: string | null;
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
};

export type GatewaySummary = {
  gatewayId: string;
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
  deviceId: string;
  lastMeasurementAt: string | null;
  lastWebhookAt: string | null;
  lastWebhookError: string | null;
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
