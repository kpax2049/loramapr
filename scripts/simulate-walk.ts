import "dotenv/config";

type Args = {
  help?: boolean;
  apiUrl?: string;
  apiKey?: string;
  deviceUid?: string;
  baseLat?: string;
  baseLon?: string;
  minutes?: string;
  intervalSec?: string;
  seed?: string;
};

const DEFAULTS = {
  apiUrl: "http://localhost:3000",
  deviceUid: "sim-device-1",
  baseLat: 37.773972,
  baseLon: -122.431297,
  minutes: 20,
  intervalSec: 5,
  seed: "loramapr"
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const apiUrl = args.apiUrl ?? DEFAULTS.apiUrl;
const apiKey = args.apiKey ?? process.env.API_KEY;
const deviceUid = args.deviceUid ?? DEFAULTS.deviceUid;
const baseLat = parseNumber(args.baseLat, DEFAULTS.baseLat);
const baseLon = parseNumber(args.baseLon, DEFAULTS.baseLon);
const minutes = parseNumber(args.minutes, DEFAULTS.minutes);
const intervalSec = parseNumber(args.intervalSec, DEFAULTS.intervalSec);
const seed = args.seed ?? DEFAULTS.seed;

if (!apiKey) {
  console.error("Missing --apiKey or API_KEY env var.");
  process.exit(1);
}

if (!globalThis.fetch) {
  console.error("Node.js 18+ is required for fetch.");
  process.exit(1);
}

const rng = createRng(seed);
const totalPoints = Math.max(1, Math.floor((minutes * 60) / intervalSec));
const measurements = buildMeasurements({
  deviceUid,
  baseLat,
  baseLon,
  totalPoints,
  intervalSec,
  rng
});

runBatches(apiUrl, apiKey, measurements)
  .then(() => {
    console.log(`Sent ${measurements.length} measurements.`);
  })
  .catch((error) => {
    console.error("Simulation failed:", error?.message ?? error);
    process.exitCode = 1;
  });

type Measurement = {
  deviceUid: string;
  capturedAt: string;
  lat: number;
  lon: number;
  rssi?: number;
  snr?: number;
};

function buildMeasurements(options: {
  deviceUid: string;
  baseLat: number;
  baseLon: number;
  totalPoints: number;
  intervalSec: number;
  rng: () => number;
}): Measurement[] {
  const { deviceUid, baseLat, baseLon, totalPoints, intervalSec, rng } = options;

  const startTime = Date.now() - totalPoints * intervalSec * 1000;
  let lat = baseLat;
  let lon = baseLon;
  let heading = rng() * Math.PI * 2;

  const stepMeters = 9;
  const jitterMeters = 1.5;

  const measurements: Measurement[] = [];
  for (let i = 0; i < totalPoints; i += 1) {
    heading += (rng() - 0.5) * 0.5;
    const step = stepMeters * (0.7 + rng() * 0.6);

    const metersPerLat = 111320;
    const metersPerLon = 111320 * Math.cos((lat * Math.PI) / 180);

    lat += (Math.cos(heading) * step) / metersPerLat;
    lon += (Math.sin(heading) * step) / metersPerLon;

    const jitterLat = gaussian(rng, 0, jitterMeters) / metersPerLat;
    const jitterLon = gaussian(rng, 0, jitterMeters) / metersPerLon;

    const capturedAt = new Date(startTime + i * intervalSec * 1000).toISOString();

    measurements.push({
      deviceUid,
      capturedAt,
      lat: round(lat + jitterLat, 7),
      lon: round(lon + jitterLon, 7),
      rssi: Math.round(clamp(gaussian(rng, -74, 6), -110, -40)),
      snr: round(clamp(gaussian(rng, 7, 3), -20, 20), 1)
    });
  }

  return measurements;
}

async function runBatches(apiUrl: string, apiKey: string, measurements: Measurement[]): Promise<void> {
  const endpoint = `${apiUrl.replace(/\/$/, "")}/api/measurements`;
  const batchSize = 50;

  for (let i = 0; i < measurements.length; i += batchSize) {
    const batch = measurements.slice(i, i + batchSize);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey
      },
      body: JSON.stringify({ items: batch })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`POST failed (${response.status}): ${text}`);
    }

    const payload = await response.json();
    console.log(`Batch ${Math.floor(i / batchSize) + 1}:`, payload);
  }
}

function parseArgs(argv: string[]): Args {
  const parsed: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--help" || value === "-h") {
      parsed.help = true;
      continue;
    }
    if (value.startsWith("--")) {
      const key = value.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        parsed[key] = next;
        i += 1;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed as Args;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function createRng(seed: string): () => number {
  const seedFn = xmur3(String(seed));
  const s = seedFn();
  return mulberry32(s);
}

function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number, mean: number, stddev: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const value = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + value * stddev;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function printHelp(): void {
  console.log(`Usage: npm run simulate:walk -- [options]

Options:
  --apiUrl        Base API URL (default: ${DEFAULTS.apiUrl})
  --apiKey        API key for X-API-Key header (or API_KEY env var)
  --deviceUid     Device UID (default: ${DEFAULTS.deviceUid})
  --baseLat       Starting latitude (default: ${DEFAULTS.baseLat})
  --baseLon       Starting longitude (default: ${DEFAULTS.baseLon})
  --minutes       Duration in minutes (default: ${DEFAULTS.minutes})
  --intervalSec   Seconds between points (default: ${DEFAULTS.intervalSec})
  --seed          Deterministic seed (default: ${DEFAULTS.seed})
  --help          Show help
`);
}
