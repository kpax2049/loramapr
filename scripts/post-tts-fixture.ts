import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";

type Args = {
  help?: boolean;
  apiUrl?: string;
  apiKey?: string;
  webhookKey?: string;
  basicUser?: string;
  basicPass?: string;
};

const DEFAULTS = {
  apiUrl: "http://localhost:3000"
};

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  printHelp();
  process.exit(0);
}

if (!globalThis.fetch) {
  console.error("Node.js 18+ is required for fetch.");
  process.exit(1);
}

const apiUrl = (args.apiUrl ?? process.env.API_URL ?? DEFAULTS.apiUrl).replace(/\/$/, "");
const queryApiKey = args.apiKey ?? process.env.API_KEY ?? process.env.QUERY_API_KEY;
const webhookKey = args.webhookKey ?? process.env.TTS_WEBHOOK_API_KEY;
const basicUser = args.basicUser ?? process.env.TTS_WEBHOOK_BASIC_USER;
const basicPass = args.basicPass ?? process.env.TTS_WEBHOOK_BASIC_PASS;

if (!queryApiKey) {
  console.error("Missing API_KEY (QUERY scope) for /api/lorawan/events.");
  process.exit(1);
}

const webhookHeaders = buildWebhookHeaders(webhookKey, basicUser, basicPass);
if (!webhookHeaders) {
  console.error("Missing webhook credentials. Set TTS_WEBHOOK_API_KEY or TTS_WEBHOOK_BASIC_USER/PASS.");
  process.exit(1);
}

const fixturePath = path.join(process.cwd(), "test", "fixtures", "tts", "uplink_with_gps.json");

run()
  .catch((error) => {
    console.error("Fixture post failed:", error?.message ?? error);
    process.exitCode = 1;
  });

async function run(): Promise<void> {
  const raw = await readFile(fixturePath, "utf8");
  const payload = JSON.parse(raw) as unknown;
  const deviceUid = extractDeviceUid(payload);

  const uplinkResponse = await fetch(`${apiUrl}/api/lorawan/uplink`, {
    method: "POST",
    headers: {
      ...webhookHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!uplinkResponse.ok) {
    const text = await uplinkResponse.text();
    throw new Error(`POST /api/lorawan/uplink failed (${uplinkResponse.status}): ${text}`);
  }

  console.log("Posted fixture uplink.");

  const latestEvent = await pollLatestEvent(apiUrl, queryApiKey, deviceUid);
  console.log("processingError:", latestEvent?.processingError ?? "null");

  const measurementCreated = await checkMeasurementCreated(apiUrl, deviceUid);
  console.log("measurementCreated:", measurementCreated ? "yes" : "no");
}

async function pollLatestEvent(
  apiUrlValue: string,
  apiKey: string,
  deviceUid?: string
): Promise<{ processingError?: string | null } | null> {
  const params = new URLSearchParams({ limit: "1" });
  if (deviceUid) {
    params.set("deviceUid", deviceUid);
  }
  const url = `${apiUrlValue}/api/lorawan/events?${params.toString()}`;
  const deadline = Date.now() + 5000;
  let latest: { processingError?: string | null; processedAt?: string | null } | null = null;

  while (Date.now() < deadline) {
    const response = await fetch(url, {
      headers: {
        "X-API-Key": apiKey
      }
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GET /api/lorawan/events failed (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as Array<{
      processingError?: string | null;
      processedAt?: string | null;
    }>;
    if (Array.isArray(payload) && payload.length > 0) {
      latest = payload[0];
      if (latest.processedAt || latest.processingError) {
        break;
      }
    }

    await delay(500);
  }

  return latest;
}

async function checkMeasurementCreated(apiUrlValue: string, deviceUid?: string): Promise<boolean> {
  if (!deviceUid) {
    console.warn("deviceUid missing from fixture payload; skipping measurement lookup.");
    return false;
  }

  const devicesResponse = await fetch(`${apiUrlValue}/api/devices`);
  if (!devicesResponse.ok) {
    const text = await devicesResponse.text();
    throw new Error(`GET /api/devices failed (${devicesResponse.status}): ${text}`);
  }
  const devices = (await devicesResponse.json()) as Array<{ id: string; deviceUid: string }>;
  const match = devices.find((device) => device.deviceUid === deviceUid);

  if (!match) {
    return false;
  }

  const measurementsUrl = new URL(`${apiUrlValue}/api/measurements`);
  measurementsUrl.searchParams.set("deviceId", match.id);
  measurementsUrl.searchParams.set("limit", "1");

  const measurementsResponse = await fetch(measurementsUrl.toString());
  if (!measurementsResponse.ok) {
    const text = await measurementsResponse.text();
    throw new Error(`GET /api/measurements failed (${measurementsResponse.status}): ${text}`);
  }

  const measurements = (await measurementsResponse.json()) as { items?: unknown[] };
  return Array.isArray(measurements.items) && measurements.items.length > 0;
}

function extractDeviceUid(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const record = payload as Record<string, unknown>;
  const endDeviceIds = record.end_device_ids;
  if (!endDeviceIds || typeof endDeviceIds !== "object") {
    return undefined;
  }
  const ids = endDeviceIds as Record<string, unknown>;
  if (typeof ids.dev_eui === "string") {
    return ids.dev_eui;
  }
  if (typeof ids.device_id === "string") {
    return ids.device_id;
  }
  return undefined;
}

function buildWebhookHeaders(
  apiKey?: string,
  user?: string,
  pass?: string
): Record<string, string> | null {
  if (apiKey) {
    return { "X-Downlink-Apikey": apiKey };
  }
  if (user && pass) {
    const encoded = Buffer.from(`${user}:${pass}`).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  return null;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function printHelp(): void {
  console.log(`Usage: npm run dev:tts:fixture -- [options]

Options:
  --apiUrl       API base URL (default: http://localhost:3000)
  --apiKey       API key with QUERY scope for /api/lorawan/events
  --webhookKey   TTS webhook API key (X-Downlink-Apikey)
  --basicUser    TTS webhook basic auth user
  --basicPass    TTS webhook basic auth password
  --help         Show help
`);
}
