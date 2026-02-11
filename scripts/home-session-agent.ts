import { distanceMeters } from '../src/common/geo/haversine';

type AgentState = {
  lastInside: boolean | null;
  lastChangeAt: number;
  lastTriggeredFor: boolean | null;
  mode: 'inside' | 'outside' | 'stale' | 'disabled' | null;
};

type LatestPositionResponse = {
  deviceUid: string;
  deviceId: string;
  capturedAt: string | null;
  lat: number | null;
  lon: number | null;
};

type AutoSessionConfigResponse = {
  deviceUid: string;
  deviceId: string;
  enabled: boolean;
  homeLat: number | null;
  homeLon: number | null;
  radiusMeters: number | null;
  minOutsideSeconds: number;
  minInsideSeconds: number;
};

const API_BASE_URL = requiredEnv('API_BASE_URL');
const INGEST_API_KEY = requiredEnv('INGEST_API_KEY');
const DEVICE_UIDS = requiredEnv('DEVICE_UIDS')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const POLL_INTERVAL_MS = parseIntEnv('POLL_INTERVAL_MS', 5000);
const STALE_SECONDS = parseIntEnv('STALE_SECONDS', 60);
const API_BASE = API_BASE_URL.replace(/\/$/, '');

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
  const config = await fetchAutoSessionConfig(deviceUid);
  if (!config) {
    return;
  }

  const state = getState(deviceUid);

  if (!config.enabled) {
    transitionMode(
      deviceUid,
      state,
      'disabled',
      null,
      null,
      null,
      'auto_session_disabled'
    );
    state.lastTriggeredFor = null;
    return;
  }

  const latest = await fetchLatestPosition(deviceUid);
  if (!latest) {
    return;
  }

  if (!latest.capturedAt || latest.lat === null || latest.lon === null) {
    transitionMode(deviceUid, state, 'stale', null, null, latest.capturedAt, 'no_position');
    return;
  }

  const capturedAtMs = Date.parse(latest.capturedAt);
  if (!Number.isFinite(capturedAtMs)) {
    transitionMode(
      deviceUid,
      state,
      'stale',
      null,
      null,
      latest.capturedAt,
      'invalid_capturedAt'
    );
    return;
  }

  const now = Date.now();
  if (now - capturedAtMs > STALE_SECONDS * 1000) {
    transitionMode(
      deviceUid,
      state,
      'stale',
      null,
      null,
      latest.capturedAt,
      'stale_position'
    );
    return;
  }

  if (config.homeLat === null || config.homeLon === null) {
    transitionMode(
      deviceUid,
      state,
      'disabled',
      null,
      null,
      latest.capturedAt,
      'missing_home_coordinates'
    );
    state.lastTriggeredFor = null;
    return;
  }

  const radiusMeters = config.radiusMeters ?? 20;
  const minOutsideSeconds = config.minOutsideSeconds ?? 30;
  const minInsideSeconds = config.minInsideSeconds ?? 120;

  const distanceM = distanceMeters(latest.lat, latest.lon, config.homeLat, config.homeLon);
  const inside = distanceM <= radiusMeters;

  transitionMode(
    deviceUid,
    state,
    inside ? 'inside' : 'outside',
    distanceM,
    inside,
    latest.capturedAt
  );

  if (state.lastInside === null) {
    state.lastInside = inside;
    state.lastChangeAt = now;
    state.lastTriggeredFor = null;
  } else if (state.lastInside !== inside) {
    state.lastInside = inside;
    state.lastChangeAt = now;
    state.lastTriggeredFor = null;
  }

  const elapsedMs = now - state.lastChangeAt;
  if (!inside && elapsedMs >= minOutsideSeconds * 1000 && state.lastTriggeredFor !== false) {
    await startSession(deviceUid, distanceM, inside, latest.capturedAt);
    state.lastTriggeredFor = false;
  }
  if (inside && elapsedMs >= minInsideSeconds * 1000 && state.lastTriggeredFor !== true) {
    await stopSession(deviceUid, distanceM, inside, latest.capturedAt);
    state.lastTriggeredFor = true;
  }
}

function getState(deviceUid: string): AgentState {
  let state = stateByDevice.get(deviceUid);
  if (!state) {
    state = {
      lastInside: null,
      lastChangeAt: Date.now(),
      lastTriggeredFor: null,
      mode: null
    };
    stateByDevice.set(deviceUid, state);
  }
  return state;
}

function transitionMode(
  deviceUid: string,
  state: AgentState,
  nextMode: AgentState['mode'],
  distanceM: number | null,
  inside: boolean | null,
  capturedAt: string | null,
  reason?: string
) {
  if (state.mode === nextMode) {
    return;
  }
  const from = state.mode ?? 'unknown';
  const suffix = reason ? ` reason=${reason}` : '';
  log(
    deviceUid,
    `transition ${from}->${nextMode ?? 'unknown'} distanceM=${formatDistance(
      distanceM
    )} inside=${formatInside(inside)} capturedAt=${capturedAt ?? 'null'}${suffix}`
  );
  state.mode = nextMode;
}

async function fetchAutoSessionConfig(
  deviceUid: string
): Promise<AutoSessionConfigResponse | null> {
  const url = `${API_BASE}/api/agent/devices/${encodeURIComponent(deviceUid)}/auto-session`;
  const response = await fetch(url, {
    headers: {
      'X-API-Key': INGEST_API_KEY
    }
  });
  if (response.status === 404) {
    log(deviceUid, 'Auto-session config: device not found.');
    return null;
  }
  if (!response.ok) {
    log(deviceUid, `Auto-session config fetch failed: ${response.status}`);
    return null;
  }
  return (await response.json()) as AutoSessionConfigResponse;
}

async function fetchLatestPosition(deviceUid: string): Promise<LatestPositionResponse | null> {
  const url = `${API_BASE}/api/agent/devices/${encodeURIComponent(deviceUid)}/latest-position`;
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

async function startSession(
  deviceUid: string,
  distanceM: number,
  inside: boolean,
  capturedAt: string
) {
  const url = `${API_BASE}/api/agent/sessions/start`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': INGEST_API_KEY
    },
    body: JSON.stringify({ deviceUid })
  });
  if (!response.ok) {
    log(
      deviceUid,
      `action=start failed status=${response.status} distanceM=${formatDistance(
        distanceM
      )} inside=${formatInside(inside)} capturedAt=${capturedAt}`
    );
    return;
  }
  const session = await response.json();
  log(
    deviceUid,
    `action=start ok distanceM=${formatDistance(distanceM)} inside=${formatInside(
      inside
    )} capturedAt=${capturedAt} response=${JSON.stringify(session)}`
  );
}

async function stopSession(
  deviceUid: string,
  distanceM: number,
  inside: boolean,
  capturedAt: string
) {
  const url = `${API_BASE}/api/agent/sessions/stop`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': INGEST_API_KEY
    },
    body: JSON.stringify({ deviceUid })
  });
  if (!response.ok) {
    log(
      deviceUid,
      `action=stop failed status=${response.status} distanceM=${formatDistance(
        distanceM
      )} inside=${formatInside(inside)} capturedAt=${capturedAt}`
    );
    return;
  }
  const payload = await response.json();
  log(
    deviceUid,
    `action=stop ok distanceM=${formatDistance(distanceM)} inside=${formatInside(
      inside
    )} capturedAt=${capturedAt} response=${JSON.stringify(payload)}`
  );
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

function formatDistance(value: number | null): string {
  if (value === null) {
    return 'na';
  }
  return value.toFixed(1);
}

function formatInside(value: boolean | null): string {
  if (value === null) {
    return 'na';
  }
  return value ? 'true' : 'false';
}

void main();
