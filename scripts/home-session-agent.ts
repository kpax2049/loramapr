import { isInsideGeofence } from '../src/common/geo/geofence';

type AgentState = {
  lastInside: boolean | null;
  lastChangeAt: number;
  lastTriggeredFor: boolean | null;
};

type LatestPositionResponse = {
  deviceUid: string;
  deviceId: string;
  capturedAt: string | null;
  lat: number | null;
  lon: number | null;
};

const API_BASE_URL = requiredEnv('API_BASE_URL');
const INGEST_API_KEY = requiredEnv('INGEST_API_KEY');
const DEVICE_UIDS = requiredEnv('DEVICE_UIDS')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const POLL_INTERVAL_MS = parseIntEnv('POLL_INTERVAL_MS', 5000);

const HOME_LAT = requiredNumberEnv('HOME_LAT');
const HOME_LON = requiredNumberEnv('HOME_LON');
const RADIUS_METERS = parseIntEnv('RADIUS_METERS', 20);
const MIN_OUTSIDE_SECONDS = parseIntEnv('MIN_OUTSIDE_SECONDS', 30);
const MIN_INSIDE_SECONDS = parseIntEnv('MIN_INSIDE_SECONDS', 120);

if (DEVICE_UIDS.length === 0) {
  throw new Error('DEVICE_UIDS must include at least one device');
}

const stateByDevice = new Map<string, AgentState>();
let isTickRunning = false;

async function main() {
  console.log(`Starting home session agent for ${DEVICE_UIDS.length} devices.`);
  await tick();
  setInterval(() => void tick(), POLL_INTERVAL_MS);
}

async function tick() {
  if (isTickRunning) {
    return;
  }
  isTickRunning = true;
  try {
    for (const deviceUid of DEVICE_UIDS) {
      await handleDevice(deviceUid);
    }
  } finally {
    isTickRunning = false;
  }
}

async function handleDevice(deviceUid: string) {
  const latest = await fetchLatestPosition(deviceUid);
  if (!latest) {
    return;
  }
  if (latest.lat === null || latest.lon === null || !latest.capturedAt) {
    log(deviceUid, 'No GPS yet; skipping.');
    return;
  }

  const inside = isInsideGeofence(latest.lat, latest.lon, HOME_LAT, HOME_LON, RADIUS_METERS);
  const now = Date.now();
  const state = getState(deviceUid, inside, now);

  if (state.lastInside !== inside) {
    const durationMs = now - state.lastChangeAt;
    log(
      deviceUid,
      `State change: ${state.lastInside ? 'inside' : 'outside'} -> ${
        inside ? 'inside' : 'outside'
      } (after ${Math.round(durationMs / 1000)}s)`
    );
    state.lastInside = inside;
    state.lastChangeAt = now;
    state.lastTriggeredFor = null;
  }

  const elapsedMs = now - state.lastChangeAt;
  if (!inside && elapsedMs >= MIN_OUTSIDE_SECONDS * 1000 && state.lastTriggeredFor !== false) {
    await startSession(deviceUid);
    state.lastTriggeredFor = false;
  }
  if (inside && elapsedMs >= MIN_INSIDE_SECONDS * 1000 && state.lastTriggeredFor !== true) {
    await stopSession(deviceUid);
    state.lastTriggeredFor = true;
  }
}

function getState(deviceUid: string, inside: boolean, now: number): AgentState {
  let state = stateByDevice.get(deviceUid);
  if (!state) {
    state = {
      lastInside: inside,
      lastChangeAt: now,
      lastTriggeredFor: null
    };
    stateByDevice.set(deviceUid, state);
    log(deviceUid, `Initial state: ${inside ? 'inside' : 'outside'}`);
  }
  return state;
}

async function fetchLatestPosition(deviceUid: string): Promise<LatestPositionResponse | null> {
  const url = `${API_BASE_URL.replace(/\\/$/, '')}/api/agent/devices/${encodeURIComponent(
    deviceUid
  )}/latest-position`;
  const response = await fetch(url, {
    headers: {
      'X-API-Key': INGEST_API_KEY
    }
  });
  if (response.status === 404) {
    log(deviceUid, 'Device not found.');
    return null;
  }
  if (!response.ok) {
    log(deviceUid, `Latest position fetch failed: ${response.status}`);
    return null;
  }
  return (await response.json()) as LatestPositionResponse;
}

async function startSession(deviceUid: string) {
  const url = `${API_BASE_URL.replace(/\\/$/, '')}/api/agent/sessions/start`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': INGEST_API_KEY
    },
    body: JSON.stringify({ deviceUid })
  });
  if (!response.ok) {
    log(deviceUid, `Start session failed: ${response.status}`);
    return;
  }
  const session = await response.json();
  log(deviceUid, `Start session response: ${JSON.stringify(session)}`);
}

async function stopSession(deviceUid: string) {
  const url = `${API_BASE_URL.replace(/\\/$/, '')}/api/agent/sessions/stop`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': INGEST_API_KEY
    },
    body: JSON.stringify({ deviceUid })
  });
  if (!response.ok) {
    log(deviceUid, `Stop session failed: ${response.status}`);
    return;
  }
  const payload = await response.json();
  log(deviceUid, `Stop session response: ${JSON.stringify(payload)}`);
}

function log(deviceUid: string, message: string) {
  console.log(`[${new Date().toISOString()}] [${deviceUid}] ${message}`);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function requiredNumberEnv(name: string): number {
  const value = requiredEnv(name);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number`);
  }
  return parsed;
}

function parseIntEnv(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be an integer`);
  }
  return parsed;
}

void main();
