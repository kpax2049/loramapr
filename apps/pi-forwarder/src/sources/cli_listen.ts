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
  let nonObjectLines = 0;
  let stderrNonJsonLines = 0;
  let stderrNonObjectLines = 0;
  let noisyStderrLines = 0;

  const stdoutReader = consumeStreamLines(child.stdout, async (line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const payload = parseJsonObject(trimmed);
    if (payload === null) {
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
      nonObjectLines += 1;
      if (nonObjectLines % NON_JSON_DEBUG_EVERY === 0) {
        options.logger.debug(
          { ignoredNonObjectLines: nonObjectLines, sample: trimmed.slice(0, 280) },
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

    const payload = parseJsonObject(trimmed);
    if (payload !== null && isRecord(payload)) {
      parsedObjects += 1;
      await options.onEvent(payload);
      return;
    }
    if (payload !== null && !isRecord(payload)) {
      stderrNonObjectLines += 1;
      if (stderrNonObjectLines % STDERR_DEBUG_EVERY === 0) {
        options.logger.debug(
          { ignoredNonObjectStderrLines: stderrNonObjectLines, sample: trimmed.slice(0, 280) },
          'Ignoring parsed JSON stderr lines that are not objects'
        );
      }
      return;
    }

    stderrNonJsonLines += 1;

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

function parseJsonObject(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
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
