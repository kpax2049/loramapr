import readline from 'node:readline';
import type { Logger } from 'pino';

export type SourceHandler = (payload: unknown) => Promise<void>;

type StdinSourceOptions = {
  logger: Logger;
  onEvent: SourceHandler;
  exitOnEof: boolean;
};

export async function runStdinSource(options: StdinSourceOptions): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
    terminal: false
  });
  let ignoredNonJsonLines = 0;
  let ignoredNonObjectLines = 0;

  options.logger.info('Reading JSON events from stdin');

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(trimmed);
    } catch {
      ignoredNonJsonLines += 1;
      options.logger.debug(
        {
          ignoredNonJsonLines,
          sample: trimmed.slice(0, 280)
        },
        'Ignoring non-JSON stdin line'
      );
      continue;
    }

    if (!isRecord(payload)) {
      ignoredNonObjectLines += 1;
      options.logger.debug(
        {
          ignoredNonObjectLines,
          sample: trimmed.slice(0, 280)
        },
        'Ignoring parsed JSON that is not an object'
      );
      continue;
    }

    await options.onEvent(payload);
  }

  options.logger.info('stdin reached EOF');
  if (!options.exitOnEof) {
    options.logger.info('STDIN_EOF_EXIT=false; keeping process alive');
    await new Promise<void>(() => {
      /* intentional no-op */
    });
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
