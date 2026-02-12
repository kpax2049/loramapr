import { ForwarderConfigError, config } from './env';
import { createLogger } from './logger';
import { createPoster } from './poster';
import { runCliListenSource } from './sources/cli_listen';
import { runStdinSource } from './sources/stdin';

async function main(): Promise<void> {
  const logger = createLogger(config);
  const postEvent = createPoster(config, logger);

  logger.info(
    {
      source: config.SOURCE,
      apiBaseUrl: config.API_BASE_URL,
      postTimeoutMs: config.POST_TIMEOUT_MS,
      retryBaseMs: config.RETRY_BASE_MS,
      retryMaxMs: config.RETRY_MAX_MS,
      maxQueue: config.MAX_QUEUE
    },
    'Starting pi-forwarder'
  );

  setInterval(() => {
    logger.info(
      {
        source: config.SOURCE,
        heartbeatSeconds: config.POLL_HEARTBEAT_SECONDS
      },
      'pi-forwarder heartbeat'
    );
  }, config.POLL_HEARTBEAT_SECONDS * 1000).unref();

  if (config.SOURCE === 'stdin') {
    await runStdinSource({
      logger,
      onEvent: postEvent,
      exitOnEof: true
    });
    return;
  }

  if (config.MESHTASTIC_HOST) {
    logger.info(
      { meshtasticHost: config.MESHTASTIC_HOST },
      'MESHTASTIC_HOST is configured but not used yet in cli mode'
    );
  }

  await runCliListenSource({
    logger,
    onEvent: postEvent,
    cliPath: config.CLI_PATH,
    meshtasticPort: config.MESHTASTIC_PORT
  });
}

void main().catch((error) => {
  if (!(error instanceof ForwarderConfigError)) {
    // Config errors are already logged once in env.ts
    console.error('[pi-forwarder] fatal startup error', error);
  }
  process.exit(1);
});
