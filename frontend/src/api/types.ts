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

export type TrackPoint = {
  capturedAt: string;
  lat: number;
  lon: number;
};
