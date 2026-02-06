// backend/scripts/seed-data.ts
import "dotenv/config";
import { Prisma, PrismaClient } from "@prisma/client";

/**
 * DB:
 *   npx ts-node scripts/seed-data.ts --db
 *
 * JSON:
 *   npx ts-node scripts/seed-data.ts --json > tmp/dummy.json
 *
 * Env:
 *   SEED=1337 CENTER_LAT=37.7749 CENTER_LON=-122.4194 OWNER_USER_ID=<uuid-or-anything>
 */

type DeviceRole = "field" | "home" | "repeater";

type Output = {
  devices: {
    deviceUid: string;
    name: string | null;
    notes: string | null;
    ownerId: string | null;
    createdAt: Date;
    lastSeenAt: Date | null;
    _role: DeviceRole;
  }[];
  sessions: {
    deviceUid: string; // resolve to deviceId
    ownerId: string | null;
    name: string | null;
    startedAt: Date;
    endedAt: Date | null;
    notes: string | null;
  }[];
  measurements: {
    deviceUid: string; // resolve to deviceId
    capturedAt: Date;
    lat: number;
    lon: number;
    alt: number | null;
    hdop: number | null;
    rssi: number | null;
    snr: number | null;
    sf: number | null;
    bw: number | null;
    freq: number | null;
    gatewayId: string | null;
    payloadRaw: string | null;
    rxMetadata: Prisma.InputJsonValue | null;
    _rxGateways: {
      gatewayId: string;
      rssi: number | null;
      snr: number | null;
      channelIndex: number | null;
      time: Date | null;
    }[];
  }[];
};

const DEFAULT_CENTER_LAT = 37.7749;
const DEFAULT_CENTER_LON = -122.4194;
const SEED_DEVICE_UID_BASE = "dev";
const SEED_DEVICE_UID_PREFIX = `${SEED_DEVICE_UID_BASE}_`;
const SEED_SESSION_PREFIX = "walk d-";
const COVERAGE_BIN_SIZE_DEG = 0.001;

// ---------------- helpers ----------------
function asUuidOrNull(v: string | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  const ok =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      s,
    );
  return ok ? s : null;
}

function readNumberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// ---------------- deterministic PRNG ----------------
const SEED = Number(process.env.SEED ?? "1337");
function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(SEED);
const idRnd = mulberry32((SEED ^ 0x9e3779b9) >>> 0);
const r = (a = 0, b = 1) => a + (b - a) * rnd();
const ri = (a: number, b: number) => Math.floor(r(a, b + 1));
const pick = <T>(xs: T[]) => xs[ri(0, xs.length - 1)];
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
function stableUid(prefix: string) {
  return `${prefix}_${Math.floor(r(1e8, 9e8)).toString(36)}${Math.floor(r(1e8, 9e8)).toString(36)}`;
}
function uuidFromRng(rng: () => number): string {
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(rng() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

// ---------------- geo + radio helpers ----------------
function distM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const Rm = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * Rm * Math.asin(Math.sqrt(a));
}

function rssiFromDistance(m: number, txPowerDbm: number) {
  const d = Math.max(1, m);
  const path = 32 + 20 * Math.log10(d);
  const fading = r(-6, 6);
  const rssi = txPowerDbm - path + fading - 60;
  return clamp(Math.round(rssi), -125, -40);
}

function snrFromRssi(rssi: number) {
  const base = (rssi + 120) / 6 - 10;
  return clamp(Math.round((base + r(-4, 6)) * 10) / 10, -20, 10);
}

function offsetLatLon(centerLat: number, dxM: number, dyM: number) {
  const dLat = dyM / 111320;
  const dLon = dxM / (111320 * Math.cos((centerLat * Math.PI) / 180));
  return { dLat, dLon };
}

// ---------------- generator ----------------
function generateDummyData(): Output {
  // Match frontend default map center so initial bbox includes seed points.
  const centerLat = readNumberEnv("CENTER_LAT", DEFAULT_CENTER_LAT);
  const centerLon = readNumberEnv("CENTER_LON", DEFAULT_CENTER_LON);
  const ownerId = asUuidOrNull(process.env.OWNER_USER_ID);

  const hw = ["Wio Tracker L1 Pro", "T-Beam v1.1", "Heltec V3", "RAK4631"];
  const fw = ["Meshtastic 2.4.2", "Meshtastic 2.5.0", "Meshtastic 2.5.3"];

  const mkDevice = (role: DeviceRole, name: string) => ({
    deviceUid: stableUid(SEED_DEVICE_UID_BASE),
    name,
    notes: `${role}; ${pick(hw)}; ${pick(fw)}`,
    ownerId,
    createdAt: new Date(Date.now() - ri(3, 120) * 86400_000),
    lastSeenAt: new Date(Date.now() - ri(0, 48) * 3600_000),
    _role: role,
  });

  const devices = [
    mkDevice("field", "kpax-field"),
    mkDevice("home", "mpax-home"),
    mkDevice("repeater", "ridge-repeater"),
    mkDevice("repeater", "town-repeater"),
  ];

  // Gateways are strings in your schema (Measurement.gatewayId, RxMetadata.gatewayId)
  const gateways: {
    gatewayId: string;
    lat: number;
    lon: number;
    online: boolean;
  }[] = [];
  const ringRadiusM = [1200, 2200, 3500, 5000, 8000];
  const nGw = 6;
  for (let i = 0; i < nGw; i++) {
    const ang = (i / nGw) * Math.PI * 2 + r(-0.15, 0.15);
    const radius = pick(ringRadiusM) * r(0.75, 1.25);
    const dx = Math.cos(ang) * radius;
    const dy = Math.sin(ang) * radius;
    const { dLat, dLon } = offsetLatLon(centerLat, dx, dy);

    gateways.push({
      gatewayId: `gw-${i + 1}`,
      lat: centerLat + dLat,
      lon: centerLon + dLon,
      online: rnd() > 0.15,
    });
  }

  const field = devices.find((d) => d._role === "field")!;
  const sessions: Output["sessions"] = [];
  const measurements: Output["measurements"] = [];

  const now = Date.now();
  for (let dayAgo = 1; dayAgo <= 7; dayAgo++) {
    const walksToday = rnd() > 0.55 ? 2 : 1;

    for (let w = 0; w < walksToday; w++) {
      const startedAt = new Date(
        now - dayAgo * 86400_000 + ri(7, 18) * 3600_000 + ri(0, 59) * 60_000,
      );
      const durMin = ri(22, 85);
      const endedAt = new Date(startedAt.getTime() + durMin * 60_000);

      sessions.push({
        deviceUid: field.deviceUid,
        ownerId,
        name: `${SEED_SESSION_PREFIX}${dayAgo} #${w + 1}`,
        startedAt,
        endedAt,
        notes: rnd() > 0.7 ? "mixed terrain, some tree cover" : null,
      });

      const intervalSec = 15;
      const total = Math.floor((durMin * 60) / intervalSec);

      let lat = centerLat + r(-0.002, 0.002);
      let lon = centerLon + r(-0.002, 0.002);
      let alt = r(235, 315);
      let heading = r(0, 360);

      const sf = pick([7, 8, 9, 10]);
      const bw = pick([125, 250]);
      const freq = 869.525;
      const txPowerDbm = 20;

      for (let i = 0; i < total; i++) {
        const capturedAt = new Date(
          startedAt.getTime() + i * intervalSec * 1000,
        );

        const stop = rnd() < 0.06;
        const speed = stop ? r(0, 0.2) : r(0.8, 1.8);
        heading =
          (heading + r(-18, 18) + (i % 80 === 0 ? r(-60, 60) : 0) + 360) % 360;

        const step = speed * intervalSec;
        const dx = Math.cos((heading * Math.PI) / 180) * step;
        const dy = Math.sin((heading * Math.PI) / 180) * step;
        const { dLat, dLon } = offsetLatLon(
          lat,
          dx + r(-1.5, 1.5),
          dy + r(-1.5, 1.5),
        );

        lat += dLat;
        lon += dLon;
        alt += r(-0.6, 0.6);

        const hdop = clamp(
          Math.round((r(0.7, 1.6) + (rnd() < 0.03 ? r(1.5, 3.0) : 0)) * 10) /
            10,
          0.6,
          4.5,
        );

        const online = gateways.filter((g) => g.online);
        const ranked = online
          .map((g) => ({ g, d: distM(lat, lon, g.lat, g.lon) }))
          .sort((a, b) => a.d - b.d);

        const best = ranked.length && rnd() > 0.12 ? ranked[0] : null;
        const bestRssi = best ? rssiFromDistance(best.d, txPowerDbm) : null;
        const bestSnr = bestRssi != null ? snrFromRssi(bestRssi) : null;

        const rxGateways: Output["measurements"][number]["_rxGateways"] = [];
        if (ranked.length && rnd() > 0.25) {
          const n = Math.min(ri(1, 3), ranked.length);
          for (let k = 0; k < n; k++) {
            const gw = ranked[k].g;
            const d = ranked[k].d;
            const rr = rssiFromDistance(d, txPowerDbm) + ri(-2, 2);
            const ss = snrFromRssi(rr) + r(-0.5, 0.5);
            rxGateways.push({
              gatewayId: gw.gatewayId,
              rssi: rr,
              snr: Math.round(ss * 10) / 10,
              channelIndex: ri(0, 7),
              time: capturedAt,
            });
          }
        }

        const rxMetadata = rxGateways.length
          ? {
              gateways: rxGateways.map((rx) => ({
                ...rx,
                time: rx.time ? rx.time.toISOString() : null,
              })),
            }
          : null;

        measurements.push({
          deviceUid: field.deviceUid,
          capturedAt,
          lat,
          lon,
          alt: Math.round(alt),
          hdop,
          rssi: bestRssi,
          snr: bestSnr,
          sf,
          bw,
          freq,
          gatewayId: best?.g.gatewayId ?? null,
          payloadRaw: null,
          rxMetadata,
          _rxGateways: rxGateways,
        });
      }
    }
  }

  return { devices, sessions, measurements };
}

type SeedSessionSummary = {
  id: string;
  deviceId: string;
  name: string | null;
  startedAt: Date;
  endedAt: Date | null;
};

type CoverageBinAccumulator = {
  deviceId: string;
  sessionId: string | null;
  gatewayId: string | null;
  day: Date;
  latBin: number;
  lonBin: number;
  count: number;
  rssiSum: number;
  rssiCount: number;
  rssiMin: number;
  rssiMax: number;
  snrSum: number;
  snrCount: number;
  snrMin: number;
  snrMax: number;
};

function startOfUtcDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

async function generateCoverageBins(
  prisma: PrismaClient,
  deviceIds: string[],
): Promise<number> {
  if (deviceIds.length === 0) return 0;

  const measurements = await prisma.measurement.findMany({
    where: { deviceId: { in: deviceIds } },
    select: {
      deviceId: true,
      sessionId: true,
      gatewayId: true,
      capturedAt: true,
      lat: true,
      lon: true,
      rssi: true,
      snr: true,
    },
  });
  if (measurements.length === 0) return 0;

  const bins = new Map<string, CoverageBinAccumulator>();
  for (const measurement of measurements) {
    const day = startOfUtcDay(measurement.capturedAt);
    const latBin = Math.floor(measurement.lat / COVERAGE_BIN_SIZE_DEG);
    const lonBin = Math.floor(measurement.lon / COVERAGE_BIN_SIZE_DEG);
    const sessionId = measurement.sessionId ?? null;
    const gatewayId = measurement.gatewayId ?? null;
    const key = [
      measurement.deviceId,
      sessionId ?? "null",
      gatewayId ?? "null",
      day.toISOString(),
      latBin,
      lonBin,
    ].join("|");

    let bin = bins.get(key);
    if (!bin) {
      bin = {
        deviceId: measurement.deviceId,
        sessionId,
        gatewayId,
        day,
        latBin,
        lonBin,
        count: 0,
        rssiSum: 0,
        rssiCount: 0,
        rssiMin: 0,
        rssiMax: 0,
        snrSum: 0,
        snrCount: 0,
        snrMin: 0,
        snrMax: 0,
      };
      bins.set(key, bin);
    }

    bin.count += 1;
    if (typeof measurement.rssi === "number" && Number.isFinite(measurement.rssi)) {
      if (bin.rssiCount === 0) {
        bin.rssiMin = measurement.rssi;
        bin.rssiMax = measurement.rssi;
      } else {
        bin.rssiMin = Math.min(bin.rssiMin, measurement.rssi);
        bin.rssiMax = Math.max(bin.rssiMax, measurement.rssi);
      }
      bin.rssiSum += measurement.rssi;
      bin.rssiCount += 1;
    }
    if (typeof measurement.snr === "number" && Number.isFinite(measurement.snr)) {
      if (bin.snrCount === 0) {
        bin.snrMin = measurement.snr;
        bin.snrMax = measurement.snr;
      } else {
        bin.snrMin = Math.min(bin.snrMin, measurement.snr);
        bin.snrMax = Math.max(bin.snrMax, measurement.snr);
      }
      bin.snrSum += measurement.snr;
      bin.snrCount += 1;
    }
  }

  const data: Prisma.CoverageBinCreateManyInput[] = [];
  for (const bin of bins.values()) {
    data.push({
      deviceId: bin.deviceId,
      sessionId: bin.sessionId,
      gatewayId: bin.gatewayId,
      day: bin.day,
      latBin: bin.latBin,
      lonBin: bin.lonBin,
      count: bin.count,
      rssiAvg: bin.rssiCount ? bin.rssiSum / bin.rssiCount : null,
      snrAvg: bin.snrCount ? bin.snrSum / bin.snrCount : null,
      rssiMin: bin.rssiCount ? bin.rssiMin : null,
      rssiMax: bin.rssiCount ? bin.rssiMax : null,
      snrMin: bin.snrCount ? bin.snrMin : null,
      snrMax: bin.snrCount ? bin.snrMax : null,
    });
  }

  if (data.length > 0) {
    await prisma.coverageBin.createMany({ data });
  }

  return data.length;
}

async function logSeedVerification(
  prisma: PrismaClient,
  sessions: SeedSessionSummary[],
  deviceIds: string[],
  coverageBinsInserted: number,
): Promise<void> {
  if (sessions.length === 0) return;

  console.log("Seed verification:");
  for (const session of sessions) {
    const aggregate = await prisma.measurement.aggregate({
      where: { sessionId: session.id },
      _count: { _all: true },
      _min: { lat: true, lon: true },
      _max: { lat: true, lon: true },
    });

    const minLat = aggregate._min.lat;
    const minLon = aggregate._min.lon;
    const maxLat = aggregate._max.lat;
    const maxLon = aggregate._max.lon;
    let pointCount = 0;
    if (
      minLat !== null &&
      minLon !== null &&
      maxLat !== null &&
      maxLon !== null
    ) {
      pointCount = await prisma.measurement.count({
        where: {
          sessionId: session.id,
          lat: { gte: minLat, lte: maxLat },
          lon: { gte: minLon, lte: maxLon },
        },
      });
    }

    console.log({
      sessionId: session.id,
      name: session.name,
      measurements: aggregate._count._all,
      points: pointCount,
      minLat,
      maxLat,
      minLon,
      maxLon,
    });
  }

  if (deviceIds.length > 0) {
    const coverageCount = await prisma.coverageBin.count({
      where: { deviceId: { in: deviceIds } },
    });
    console.log("Coverage bins:", {
      inserted: coverageBinsInserted,
      total: coverageCount,
    });
  }
}

// ---------------- prisma connection ----------------
async function getPrisma(): Promise<PrismaClient> {
  try {
    const mod = await import("../src/prisma/prisma.service");
    const prisma = new mod.PrismaService();
    if (typeof prisma.$connect === "function") await prisma.$connect();
    return prisma;
  } catch {
    const prisma = new PrismaClient();
    await prisma.$connect();
    return prisma;
  }
}

// ---------------- DB writes (matches your schema) ----------------
async function writeToDb(prisma: PrismaClient, data: Output) {
  if (process.env.NODE_ENV === "production")
    throw new Error("Refuse: production");

  const seedOwnerId = asUuidOrNull(process.env.OWNER_USER_ID);

  const deviceScope: Prisma.DeviceWhereInput = seedOwnerId
    ? { ownerId: seedOwnerId, deviceUid: { startsWith: SEED_DEVICE_UID_PREFIX } }
    : { deviceUid: { startsWith: SEED_DEVICE_UID_PREFIX } };
  const seedDevices = await prisma.device.findMany({
    where: deviceScope,
    select: { id: true },
  });
  const seedDeviceIds = seedDevices.map((device) => device.id);

  const sessionScopeOr: Prisma.SessionWhereInput[] = [
    { name: { startsWith: SEED_SESSION_PREFIX } },
  ];
  if (seedDeviceIds.length > 0) {
    sessionScopeOr.push({ deviceId: { in: seedDeviceIds } });
  }
  const sessionScope: Prisma.SessionWhereInput = seedOwnerId
    ? { ownerId: seedOwnerId, OR: sessionScopeOr }
    : { OR: sessionScopeOr };
  const seedSessions = await prisma.session.findMany({
    where: sessionScope,
    select: { id: true },
  });
  const seedSessionIds = seedSessions.map((session) => session.id);

  const coverageScopeOr: Prisma.CoverageBinWhereInput[] = [];
  if (seedDeviceIds.length > 0) {
    coverageScopeOr.push({ deviceId: { in: seedDeviceIds } });
  }
  if (seedSessionIds.length > 0) {
    coverageScopeOr.push({ sessionId: { in: seedSessionIds } });
  }
  if (coverageScopeOr.length > 0) {
    await prisma.coverageBin.deleteMany({ where: { OR: coverageScopeOr } });
  }

  const measurementScopeOr: Prisma.MeasurementWhereInput[] = [];
  if (seedDeviceIds.length > 0) {
    measurementScopeOr.push({ deviceId: { in: seedDeviceIds } });
  }
  if (seedSessionIds.length > 0) {
    measurementScopeOr.push({ sessionId: { in: seedSessionIds } });
  }
  if (measurementScopeOr.length > 0) {
    await prisma.measurement.deleteMany({ where: { OR: measurementScopeOr } });
  }

  await prisma.session.deleteMany({ where: sessionScope });

  // 1) Devices (upsert by deviceUid)
  const deviceIdByUid = new Map<string, string>();
  for (const d of data.devices) {
    const row = await prisma.device.upsert({
      where: { deviceUid: d.deviceUid },
      update: {
        name: d.name,
        notes: d.notes,
        ownerId: d.ownerId,
        lastSeenAt: d.lastSeenAt,
      },
      create: {
        deviceUid: d.deviceUid,
        name: d.name,
        notes: d.notes,
        ownerId: d.ownerId,
        createdAt: d.createdAt,
        lastSeenAt: d.lastSeenAt,
      },
      select: { id: true, deviceUid: true },
    });
    deviceIdByUid.set(row.deviceUid, row.id);
  }

  // 2) Create sessions and keep them in memory for sessionId assignment
  const createdSessions: SeedSessionSummary[] = [];
  for (const s of data.sessions) {
    const deviceId = deviceIdByUid.get(s.deviceUid);
    if (!deviceId)
      throw new Error(`Missing deviceId for deviceUid ${s.deviceUid}`);

    const row = await prisma.session.create({
      data: {
        deviceId,
        ownerId: s.ownerId,
        name: s.name,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        notes: s.notes,
      },
      select: {
        id: true,
        deviceId: true,
        startedAt: true,
        endedAt: true,
        name: true,
      },
    });

    createdSessions.push(row);
  }

  // Ensure deterministic matching: sort by device then startedAt
  createdSessions.sort((a, b) => {
    if (a.deviceId < b.deviceId) return -1;
    if (a.deviceId > b.deviceId) return 1;
    return a.startedAt.getTime() - b.startedAt.getTime();
  });

  function findSessionId(deviceId: string, capturedAt: Date): string | null {
    // same device, window containment
    for (const s of createdSessions) {
      if (s.deviceId !== deviceId) continue;
      const end = s.endedAt ?? new Date(s.startedAt.getTime() + 6 * 3600_000);
      if (capturedAt >= s.startedAt && capturedAt <= end) return s.id;
    }
    return null;
  }

  // 3) Insert measurements and RxMetadata with correct sessionId
  const measurementRows: Prisma.MeasurementCreateManyInput[] = [];
  const rxRows: Prisma.RxMetadataCreateManyInput[] = [];
  for (const m of data.measurements) {
    const deviceId = deviceIdByUid.get(m.deviceUid);
    if (!deviceId)
      throw new Error(`Missing deviceId for deviceUid ${m.deviceUid}`);

    const sessionId = findSessionId(deviceId, m.capturedAt);
    const measurementId = uuidFromRng(idRnd);

    measurementRows.push({
      id: measurementId,
      deviceId,
      sessionId,
      capturedAt: m.capturedAt,
      lat: m.lat,
      lon: m.lon,
      alt: m.alt,
      hdop: m.hdop,
      rssi: m.rssi,
      snr: m.snr,
      sf: m.sf,
      bw: m.bw,
      freq: m.freq,
      gatewayId: m.gatewayId,
      payloadRaw: m.payloadRaw,
      rxMetadata: m.rxMetadata ?? undefined,
    });

    for (const rx of m._rxGateways) {
      rxRows.push({
        measurementId,
        gatewayId: rx.gatewayId,
        rssi: rx.rssi,
        snr: rx.snr,
        channelIndex: rx.channelIndex,
        time: rx.time,
      });
    }
  }

  let insertedMeasurements = 0;
  let insertedRx = 0;
  const insertBatchSize = 1000;

  for (let i = 0; i < measurementRows.length; i += insertBatchSize) {
    const batch = measurementRows.slice(i, i + insertBatchSize);
    const result = await prisma.measurement.createMany({ data: batch });
    insertedMeasurements += result.count;
  }

  for (let i = 0; i < rxRows.length; i += insertBatchSize) {
    const batch = rxRows.slice(i, i + insertBatchSize);
    const result = await prisma.rxMetadata.createMany({
      data: batch,
      skipDuplicates: true,
    });
    insertedRx += result.count;
  }

  const activeDeviceIds = Array.from(new Set(deviceIdByUid.values()));
  const coverageBinsInserted = await generateCoverageBins(
    prisma,
    activeDeviceIds,
  );

  const [cDevices, cSessions, cMeas, cRx] = await Promise.all([
    prisma.device.count(),
    prisma.session.count(),
    prisma.measurement.count(),
    prisma.rxMetadata.count(),
  ]);

  const unassigned = await prisma.measurement.count({
    where: { sessionId: null },
  });

  console.log("Seed done:", {
    devices: cDevices,
    sessions: cSessions,
    measurements: cMeas,
    rxMetadata: cRx,
    insertedMeasurements,
    insertedRx,
    coverageBinsInserted,
    unassignedMeasurements: unassigned,
  });

  await logSeedVerification(
    prisma,
    createdSessions,
    activeDeviceIds,
    coverageBinsInserted,
  );
}

// ---------------- CLI ----------------
async function main() {
  const args = process.argv.slice(2);
  const data = generateDummyData();

  if (args.includes("--json")) {
    process.stdout.write(JSON.stringify(data, null, 2));
    return;
  }

  if (args.includes("--db")) {
    const prisma = await getPrisma();
    await writeToDb(prisma, data);
    if (typeof prisma.$disconnect === "function") await prisma.$disconnect();
    return;
  }

  throw new Error("Usage: --json or --db");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
