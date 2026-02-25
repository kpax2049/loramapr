import "dotenv/config";

type Args = {
  help?: boolean;
  apiUrl?: string;
  apiKey?: string;
  deviceUid?: string;
  baseLat?: string;
  baseLon?: string;
  intervalSec?: string;
  seed?: string;
  letterHeightM?: string;
  pointSpacingM?: string;
  rotateDeg?: string;
  gatewayId?: string;
};

type Vec = {
  x: number;
  y: number;
};

type Glyph = {
  advance: number;
  points: Vec[];
};

type WordPoint = {
  xM: number;
  yM: number;
  letterIndex: number;
};

type Measurement = {
  deviceUid: string;
  capturedAt: string;
  lat: number;
  lon: number;
  rssi: number;
  snr: number;
  gatewayId?: string;
  payloadRaw: string;
};

const DEFAULTS = {
  apiUrl: "http://localhost:3000",
  deviceUid: "sim-logo-loramapr",
  baseLat: 37.773972,
  baseLon: -122.431297,
  intervalSec: 2,
  seed: "loramapr-logo",
  letterHeightM: 55,
  pointSpacingM: 3,
  rotateDeg: 0
};

const WORD = "LoRaMapr";

const LETTER_RSSI_BASE = [-48, -58, -67, -76, -84, -72, -61, -53];

const GLYPHS: Record<string, Glyph> = {
  L: {
    advance: 0.8,
    points: [
      { x: 0.12, y: 1.0 },
      { x: 0.12, y: 0.0 },
      { x: 0.62, y: 0.0 }
    ]
  },
  o: {
    advance: 0.84,
    points: makeLoop(0.42, 0.42, 0.28, 0.34, 18)
  },
  R: {
    advance: 0.9,
    points: [
      { x: 0.12, y: 0.0 },
      { x: 0.12, y: 1.0 },
      { x: 0.54, y: 1.0 },
      { x: 0.67, y: 0.86 },
      { x: 0.67, y: 0.68 },
      { x: 0.54, y: 0.54 },
      { x: 0.12, y: 0.54 },
      { x: 0.67, y: 0.0 }
    ]
  },
  a: {
    advance: 0.82,
    points: [
      ...makeLoop(0.34, 0.33, 0.23, 0.28, 14),
      { x: 0.58, y: 0.66 },
      { x: 0.58, y: 0.0 }
    ]
  },
  M: {
    advance: 0.9,
    points: [
      { x: 0.1, y: 0.0 },
      { x: 0.1, y: 1.0 },
      { x: 0.34, y: 0.5 },
      { x: 0.58, y: 1.0 },
      { x: 0.58, y: 0.0 }
    ]
  },
  p: {
    advance: 0.82,
    points: [
      { x: 0.13, y: -0.35 },
      { x: 0.13, y: 0.75 },
      { x: 0.44, y: 0.75 },
      { x: 0.59, y: 0.58 },
      { x: 0.59, y: 0.37 },
      { x: 0.44, y: 0.2 },
      { x: 0.13, y: 0.2 }
    ]
  },
  r: {
    advance: 0.64,
    points: [
      { x: 0.13, y: 0.0 },
      { x: 0.13, y: 0.72 },
      { x: 0.39, y: 0.72 },
      { x: 0.55, y: 0.57 }
    ]
  }
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

const apiUrl = args.apiUrl ?? DEFAULTS.apiUrl;
const apiKey = args.apiKey ?? process.env.API_KEY ?? process.env.INGEST_API_KEY;
const deviceUid = args.deviceUid ?? DEFAULTS.deviceUid;
const baseLat = parseNumber(args.baseLat, DEFAULTS.baseLat);
const baseLon = parseNumber(args.baseLon, DEFAULTS.baseLon);
const intervalSec = parseNumber(args.intervalSec, DEFAULTS.intervalSec);
const seed = args.seed ?? DEFAULTS.seed;
const letterHeightM = parseNumber(args.letterHeightM, DEFAULTS.letterHeightM);
const pointSpacingM = parseNumber(args.pointSpacingM, DEFAULTS.pointSpacingM);
const rotateDeg = parseNumber(args.rotateDeg, DEFAULTS.rotateDeg);
const gatewayId = args.gatewayId?.trim() || undefined;

if (!apiKey) {
  console.error("Missing --apiKey or API_KEY/INGEST_API_KEY env var.");
  process.exit(1);
}

if (!globalThis.fetch) {
  console.error("Node.js 18+ is required for fetch.");
  process.exit(1);
}

if (intervalSec <= 0) {
  console.error("--intervalSec must be > 0");
  process.exit(1);
}

if (letterHeightM <= 0 || pointSpacingM <= 0) {
  console.error("--letterHeightM and --pointSpacingM must be > 0");
  process.exit(1);
}

const rng = createRng(seed);
const rawPath = buildWordPath(WORD, letterHeightM, pointSpacingM);
const centeredPath = centerPath(rawPath);
const measurements = buildMeasurements({
  path: centeredPath,
  deviceUid,
  baseLat,
  baseLon,
  intervalSec,
  rotateDeg,
  gatewayId,
  rng
});

runBatches(apiUrl, apiKey, measurements)
  .then(() => {
    console.log(`Sent ${measurements.length} logo-walk measurements for "${WORD}".`);
  })
  .catch((error) => {
    console.error("Simulation failed:", error?.message ?? error);
    process.exitCode = 1;
  });

function buildWordPath(word: string, letterHeightM: number, pointSpacingM: number): WordPoint[] {
  const letterSpacingUnits = 0.18;
  let cursorUnits = 0;
  const points: WordPoint[] = [];
  let previousEnd: Vec | null = null;

  for (let index = 0; index < word.length; index += 1) {
    const ch = word[index];
    const glyph = GLYPHS[ch];
    if (!glyph) {
      throw new Error(`No glyph defined for character: "${ch}"`);
    }

    const transformed = glyph.points.map((point) => ({
      x: (cursorUnits + point.x) * letterHeightM,
      y: point.y * letterHeightM
    }));

    if (transformed.length === 0) {
      cursorUnits += glyph.advance + letterSpacingUnits;
      continue;
    }

    if (previousEnd) {
      appendSegment(points, previousEnd, transformed[0], pointSpacingM * 1.5, index);
    }

    for (let i = 0; i < transformed.length - 1; i += 1) {
      appendSegment(points, transformed[i], transformed[i + 1], pointSpacingM, index);
    }

    previousEnd = transformed[transformed.length - 1];
    cursorUnits += glyph.advance + letterSpacingUnits;
  }

  return dedupeAdjacent(points);
}

function appendSegment(
  points: WordPoint[],
  start: Vec,
  end: Vec,
  spacingM: number,
  letterIndex: number
): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.ceil(distance / spacingM));

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    points.push({
      xM: start.x + dx * t,
      yM: start.y + dy * t,
      letterIndex
    });
  }
}

function dedupeAdjacent(points: WordPoint[]): WordPoint[] {
  if (points.length <= 1) {
    return points;
  }

  const result: WordPoint[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const prev = result[result.length - 1];
    const cur = points[i];
    if (prev.xM === cur.xM && prev.yM === cur.yM && prev.letterIndex === cur.letterIndex) {
      continue;
    }
    result.push(cur);
  }
  return result;
}

function centerPath(points: WordPoint[]): WordPoint[] {
  if (points.length === 0) {
    return points;
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    if (point.xM < minX) minX = point.xM;
    if (point.xM > maxX) maxX = point.xM;
    if (point.yM < minY) minY = point.yM;
    if (point.yM > maxY) maxY = point.yM;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return points.map((point) => ({
    xM: point.xM - centerX,
    yM: point.yM - centerY,
    letterIndex: point.letterIndex
  }));
}

function buildMeasurements(options: {
  path: WordPoint[];
  deviceUid: string;
  baseLat: number;
  baseLon: number;
  intervalSec: number;
  rotateDeg: number;
  gatewayId?: string;
  rng: () => number;
}): Measurement[] {
  const { path, deviceUid, baseLat, baseLon, intervalSec, rotateDeg, gatewayId, rng } = options;
  const total = path.length;
  const startTime = Date.now() - total * intervalSec * 1000;

  const letterCounts = new Map<number, number>();
  for (const point of path) {
    letterCounts.set(point.letterIndex, (letterCounts.get(point.letterIndex) ?? 0) + 1);
  }
  const letterSeen = new Map<number, number>();

  const rotationRad = (rotateDeg * Math.PI) / 180;
  const sin = Math.sin(rotationRad);
  const cos = Math.cos(rotationRad);
  const metersPerLat = 111320;
  const metersPerLon = 111320 * Math.cos((baseLat * Math.PI) / 180);

  const measurements: Measurement[] = [];
  for (let i = 0; i < total; i += 1) {
    const source = path[i];
    const localX = source.xM * cos - source.yM * sin;
    const localY = source.xM * sin + source.yM * cos;

    const jitterXM = gaussian(rng, 0, 0.35);
    const jitterYM = gaussian(rng, 0, 0.35);

    const lat = baseLat + (localY + jitterYM) / metersPerLat;
    const lon = baseLon + (localX + jitterXM) / metersPerLon;

    const seen = letterSeen.get(source.letterIndex) ?? 0;
    const count = Math.max(1, letterCounts.get(source.letterIndex) ?? 1);
    letterSeen.set(source.letterIndex, seen + 1);

    const letterProgress = count <= 1 ? 0 : seen / (count - 1);
    const globalProgress = total <= 1 ? 0 : i / (total - 1);
    const baseRssi = LETTER_RSSI_BASE[source.letterIndex % LETTER_RSSI_BASE.length];
    const rssi = Math.round(
      clamp(
        baseRssi +
          Math.sin(letterProgress * Math.PI * 2) * 7 +
          Math.sin(globalProgress * Math.PI * 5) * 3 +
          gaussian(rng, 0, 1.7),
        -120,
        -35
      )
    );

    const snr = round(clamp((rssi + 120) / 6 - 8 + gaussian(rng, 0, 0.9), -20, 20), 1);
    const capturedAt = new Date(startTime + i * intervalSec * 1000).toISOString();

    measurements.push({
      deviceUid,
      capturedAt,
      lat: round(lat, 7),
      lon: round(lon, 7),
      rssi,
      snr,
      gatewayId,
      payloadRaw: JSON.stringify({
        simulator: "logo-walk",
        word: WORD,
        letterIndex: source.letterIndex
      })
    });
  }

  return measurements;
}

async function runBatches(apiUrl: string, apiKey: string, measurements: Measurement[]): Promise<void> {
  const endpoint = `${apiUrl.replace(/\/$/, "")}/api/measurements`;
  const batchSize = 80;

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
  return mulberry32(seedFn());
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

function mulberry32(seed: number): () => number {
  let a = seed;
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

function makeLoop(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  points: number
): Vec[] {
  const result: Vec[] = [];
  const count = Math.max(8, points);
  for (let i = 0; i <= count; i += 1) {
    const theta = (i / count) * Math.PI * 2;
    result.push({
      x: cx + Math.cos(theta) * rx,
      y: cy + Math.sin(theta) * ry
    });
  }
  return result;
}

function printHelp(): void {
  console.log(`Usage: npm run simulate:logo -- [options]

Create a stylized "LoRaMapr" walking path with intentionally varied RSSI ranges
so points render as different colors in the map.

Options:
  --apiUrl         Base API URL (default: ${DEFAULTS.apiUrl})
  --apiKey         API key for X-API-Key header (or API_KEY / INGEST_API_KEY env var)
  --deviceUid      Device UID (default: ${DEFAULTS.deviceUid})
  --baseLat        Center latitude (default: ${DEFAULTS.baseLat})
  --baseLon        Center longitude (default: ${DEFAULTS.baseLon})
  --intervalSec    Seconds between points (default: ${DEFAULTS.intervalSec})
  --letterHeightM  Letter height in meters (default: ${DEFAULTS.letterHeightM})
  --pointSpacingM  Spacing between generated points in meters (default: ${DEFAULTS.pointSpacingM})
  --rotateDeg      Rotate text path clockwise in degrees (default: ${DEFAULTS.rotateDeg})
  --gatewayId      Optional gatewayId to tag points
  --seed           Deterministic seed (default: ${DEFAULTS.seed})
  --help           Show help

Example:
  npm run simulate:logo -- --apiKey YOUR_INGEST_KEY --deviceUid demo-logo-1 --baseLat 37.7749 --baseLon -122.4194 --rotateDeg -12
`);
}
