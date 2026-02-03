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

export type TrackPoint = {
  capturedAt: string;
  lat: number;
  lon: number;
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
