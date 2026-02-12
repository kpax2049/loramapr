import { spawn, type ChildProcessByStdio } from 'node:child_process';
import readline from 'node:readline';
import type { Readable } from 'node:stream';
import type { Logger } from 'pino';
import type { SourceHandler } from './stdin';

type SpawnedCliChild = ChildProcessByStdio<null, Readable, Readable>;

type CliListenSourceOptions = {
  logger: Logger;
  onEvent: SourceHandler;
  cliPath: string;
  meshtasticPort?: string;
};

const BASE_RESTART_MS = 2000;
const MAX_RESTART_MS = 30000;
const NON_JSON_DEBUG_EVERY = 100;
const STDERR_DEBUG_EVERY = 100;

export async function runCliListenSource(options: CliListenSourceOptions): Promise<void> {
  let stopRequested = false;
  let activeChild: SpawnedCliChild | null = null;
  let restartDelayMs = BASE_RESTART_MS;

  const requestStop = () => {
    stopRequested = true;
    if (activeChild && activeChild.exitCode === null) {
      activeChild.kill('SIGTERM');
    }
  };

  process.once('SIGINT', requestStop);
  process.once('SIGTERM', requestStop);

  try {
    while (!stopRequested) {
      const args = buildMeshtasticListenArgs(options.meshtasticPort);
      options.logger.info({ command: options.cliPath, args }, 'Starting Meshtastic CLI listen process');

      const result = await runOnce(options, args, (child) => {
        activeChild = child;
      });

      activeChild = null;
      if (stopRequested) {
        break;
      }

      options.logger.error(
        {
          exitCode: result.exitCode,
          signal: result.signal,
          parsedObjects: result.parsedObjects,
          restartDelayMs
        },
        'Meshtastic CLI process exited unexpectedly; restarting'
      );

      await sleep(restartDelayMs);
      restartDelayMs = Math.min(MAX_RESTART_MS, restartDelayMs * 2);
    }
  } finally {
    process.removeListener('SIGINT', requestStop);
    process.removeListener('SIGTERM', requestStop);
  }
}

async function runOnce(
  options: CliListenSourceOptions,
  args: string[],
  onSpawn: (child: SpawnedCliChild) => void
): Promise<{ exitCode: number | null; signal: NodeJS.Signals | null; parsedObjects: number }> {
  const child = spawn(options.cliPath, args, {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  onSpawn(child);
  let parsedObjects = 0;
  let nonJsonLines = 0;
  let noisyStderrLines = 0;

  const stdoutReader = consumeStreamLines(child.stdout, async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch (error) {
      nonJsonLines += 1;
      if (nonJsonLines % NON_JSON_DEBUG_EVERY === 0) {
        options.logger.debug(
          { ignoredNonJsonLines: nonJsonLines, sample: trimmed.slice(0, 280) },
          'Ignoring non-JSON CLI output lines'
        );
      }
      return;
    }

    if (!isRecord(payload)) {
      nonJsonLines += 1;
      if (nonJsonLines % NON_JSON_DEBUG_EVERY === 0) {
        options.logger.debug(
          { ignoredNonJsonLines: nonJsonLines, sample: trimmed.slice(0, 280) },
          'Ignoring parsed JSON that is not an object'
        );
      }
      return;
    }

    parsedObjects += 1;
    await options.onEvent(payload);
  });

  const stderrReader = consumeStreamLines(child.stderr, async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const fallbackPayload = parsePacketFromStderr(trimmed);
    if (fallbackPayload) {
      parsedObjects += 1;
      await options.onEvent(fallbackPayload);
      options.logger.debug(
        { packetId: fallbackPayload.packetId, from: fallbackPayload.from ?? fallbackPayload.nodeId },
        'Parsed Meshtastic packet from stderr fallback'
      );
      return;
    }

    if (isImportantStderr(trimmed)) {
      options.logger.warn({ stderr: trimmed }, 'Source stderr');
      return;
    }

    noisyStderrLines += 1;
    if (noisyStderrLines % STDERR_DEBUG_EVERY === 0) {
      options.logger.debug(
        { noisyStderrLines, sample: trimmed.slice(0, 280) },
        'Ignoring non-packet stderr lines'
      );
    }
  });

  const result = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>(
    (resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve({ exitCode: code, signal }));
    }
  );

  await Promise.all([stdoutReader, stderrReader]);
  return {
    exitCode: result.exitCode,
    signal: result.signal,
    parsedObjects
  };
}

async function consumeStreamLines(
  stream: NodeJS.ReadableStream,
  onLine: (line: string) => Promise<void>
): Promise<void> {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    await onLine(line);
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function buildMeshtasticListenArgs(port?: string): string[] {
  const args = ['--listen'];
  if (port) {
    args.push('--port', port);
  }
  return args;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePacketFromStderr(line: string): Record<string, unknown> | null {
  if (!line.includes('packet={')) {
    return null;
  }

  const lat = extractNumber(line, /'latitude'\s*:\s*(-?\d+(?:\.\d+)?)/);
  const lon = extractNumber(line, /'longitude'\s*:\s*(-?\d+(?:\.\d+)?)/);
  if (lat === null || lon === null) {
    return null;
  }

  const payload: Record<string, unknown> = {
    lat,
    lon
  };

  const fromId = extractString(line, /'fromId'\s*:\s*'([^']+)'/);
  const fromNumeric = extractNumber(line, /'from'\s*:\s*(\d+)/);
  if (fromId) {
    payload.from = fromId;
  } else if (fromNumeric !== null) {
    payload.nodeId = String(Math.trunc(fromNumeric));
  }

  const packetId = extractNumber(line, /'id'\s*:\s*(\d+)/);
  if (packetId !== null) {
    payload.packetId = Math.trunc(packetId);
  }

  const positionTime = extractNumber(line, /'time'\s*:\s*(\d+)/);
  const rxTime = extractNumber(line, /'rxTime'\s*:\s*(\d+)/);
  const timestamp = positionTime ?? rxTime;
  if (timestamp !== null) {
    payload.timestamp = Math.trunc(timestamp);
  }

  return payload;
}

function extractNumber(input: string, pattern: RegExp): number | null {
  const match = pattern.exec(input);
  if (!match || !match[1]) {
    return null;
  }

  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

function extractString(input: string, pattern: RegExp): string | null {
  const match = pattern.exec(input);
  if (!match || !match[1]) {
    return null;
  }

  return match[1];
}

function isImportantStderr(line: string): boolean {
  const lowered = line.toLowerCase();
  if (lowered.includes('os error')) {
    return true;
  }
  if (lowered.includes('could not exclusively lock port')) {
    return true;
  }
  if (lowered.includes('traceback')) {
    return true;
  }
  if (lowered.includes('error')) {
    return true;
  }

  return false;
}
