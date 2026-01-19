#!/usr/bin/env node
/* eslint-disable no-console */

const DEFAULTS = {
  baseUrl: 'http://localhost:3000',
  deviceUid: 'synthetic-device-1',
  points: 200,
  batchSize: 50,
  intervalSeconds: 5,
  seed: 'loramapr',
  startLat: 37.773972,
  startLon: -122.431297,
  stepMeters: 12,
  jitterMeters: 2
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const config = {
  baseUrl: args.baseUrl ?? DEFAULTS.baseUrl,
  apiKey: args.apiKey ?? process.env.API_KEY,
  deviceUid: args.deviceUid ?? DEFAULTS.deviceUid,
  points: parseNumber(args.points, DEFAULTS.points),
  batchSize: parseNumber(args.batchSize, DEFAULTS.batchSize),
  intervalSeconds: parseNumber(args.intervalSeconds, DEFAULTS.intervalSeconds),
  seed: args.seed ?? DEFAULTS.seed,
  startLat: parseNumber(args.startLat, DEFAULTS.startLat),
  startLon: parseNumber(args.startLon, DEFAULTS.startLon),
  stepMeters: parseNumber(args.stepMeters, DEFAULTS.stepMeters),
  jitterMeters: parseNumber(args.jitterMeters, DEFAULTS.jitterMeters)
};

if (!config.apiKey) {
  console.error('Missing API key. Pass --api-key or set API_KEY env var.');
  process.exit(1);
}

if (!globalThis.fetch) {
  console.error('This script requires Node.js 18+ with global fetch.');
  process.exit(1);
}

const rng = createRng(config.seed);
const measurements = buildMeasurements(config, rng);

runBatches(config, measurements)
  .then(() => {
    console.log(`Done. Sent ${measurements.length} measurements.`);
  })
  .catch((error) => {
    console.error('Ingestion failed:', error?.message ?? error);
    process.exit(1);
  });

function buildMeasurements(config, rng) {
  const startTime = Date.now() - config.points * config.intervalSeconds * 1000;
  let lat = config.startLat;
  let lon = config.startLon;
  let heading = rng() * Math.PI * 2;

  const measurements = [];
  for (let i = 0; i < config.points; i += 1) {
    const stepMeters = config.stepMeters * (0.6 + rng() * 0.8);
    heading += (rng() - 0.5) * 0.6;

    const metersPerLat = 111320;
    const metersPerLon = 111320 * Math.cos((lat * Math.PI) / 180);

    lat += (Math.cos(heading) * stepMeters) / metersPerLat;
    lon += (Math.sin(heading) * stepMeters) / metersPerLon;

    const jitterLat = gaussian(rng, 0, config.jitterMeters) / metersPerLat;
    const jitterLon = gaussian(rng, 0, config.jitterMeters) / metersPerLon;

    const capturedAt = new Date(startTime + i * config.intervalSeconds * 1000).toISOString();

    const measurement = {
      deviceUid: config.deviceUid,
      capturedAt,
      lat: round(lat + jitterLat, 7),
      lon: round(lon + jitterLon, 7)
    };

    maybeSet(measurement, 'alt', round(gaussian(rng, 18, 4), 1), rng() < 0.7);
    maybeSet(measurement, 'hdop', round(clamp(gaussian(rng, 0.9, 0.3), 0.4, 2.5), 2), rng() < 0.7);
    maybeSet(measurement, 'rssi', Math.round(clamp(gaussian(rng, -72, 6), -110, -40)), rng() < 0.9);
    maybeSet(measurement, 'snr', round(clamp(gaussian(rng, 8, 3), -20, 20), 1), rng() < 0.9);
    maybeSet(measurement, 'sf', sample(rng, [7, 8, 9, 10, 11, 12]), rng() < 0.6);
    maybeSet(measurement, 'bw', sample(rng, [125, 250, 500]), rng() < 0.6);
    maybeSet(measurement, 'freq', round(sample(rng, [868.1, 868.3, 868.5, 915.2, 915.5]), 1), rng() < 0.6);
    maybeSet(measurement, 'gatewayId', `gw-${String(Math.floor(rng() * 5) + 1).padStart(2, '0')}`, rng() < 0.5);
    maybeSet(measurement, 'payloadRaw', randomHex(rng, 16), rng() < 0.3);

    measurements.push(measurement);
  }

  return measurements;
}

async function runBatches(config, measurements) {
  const endpoint = `${config.baseUrl.replace(/\/$/, '')}/api/measurements`;
  for (let i = 0; i < measurements.length; i += config.batchSize) {
    const batch = measurements.slice(i, i + config.batchSize);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.apiKey
      },
      body: JSON.stringify({ measurements: batch })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`POST failed (${response.status}): ${text}`);
    }

    const payload = await response.json();
    console.log(`Batch ${Math.floor(i / config.batchSize) + 1}:`, payload);
  }
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--help' || value === '-h') {
      args.help = true;
      continue;
    }
    if (value.startsWith('--')) {
      const key = value.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i += 1;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

function printHelp() {
  console.log(`Usage: node scripts/ingest-synthetic.js [options]

Options:
  --api-key           API key to send in X-API-Key (or set API_KEY env)
  --base-url          Base URL (default: ${DEFAULTS.baseUrl})
  --device-uid        Device UID (default: ${DEFAULTS.deviceUid})
  --points            Number of measurements (default: ${DEFAULTS.points})
  --batch-size        Batch size (default: ${DEFAULTS.batchSize})
  --interval-seconds  Time between points (default: ${DEFAULTS.intervalSeconds})
  --seed              Deterministic seed (default: ${DEFAULTS.seed})
  --start-lat         Starting latitude (default: ${DEFAULTS.startLat})
  --start-lon         Starting longitude (default: ${DEFAULTS.startLon})
  --step-meters       Step length (default: ${DEFAULTS.stepMeters})
  --jitter-meters     Jitter amount (default: ${DEFAULTS.jitterMeters})
`);
}

function parseNumber(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createRng(seed) {
  const seedFn = xmur3(String(seed));
  const s = seedFn();
  return mulberry32(s);
}

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng, mean, stddev) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const value = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + value * stddev;
}

function sample(rng, values) {
  return values[Math.floor(rng() * values.length)];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function randomHex(rng, length) {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += chars[Math.floor(rng() * chars.length)];
  }
  return result;
}

function maybeSet(target, key, value, condition) {
  if (condition) {
    target[key] = value;
  }
}
